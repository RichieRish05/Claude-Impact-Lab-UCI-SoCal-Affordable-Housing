import { NotFoundError } from "@/lib/auth/errors";
import { assertOwner } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CHECKLIST_ITEMS, SUBMITTED_ITEM, type ChecklistKey } from "@/lib/projects/checklist";
import { todayInLA } from "@/lib/projects/review-clock";
import {
  planChecklistChange,
  planStageChange,
  planSubmittedOnChange,
  type ActivityEntry,
  type ActivityKind,
  type Plan,
  type ProjectState,
} from "@/lib/projects/rules";
import type { ProjectStage } from "@/lib/projects/stages";
import { PARCEL_RESULT_COLUMNS, type ParcelResult } from "./parcels";

type User = { id: string };
type Tx = Prisma.TransactionClient;

export type BoardProject = {
  id: string;
  name: string;
  stage: ProjectStage;
  lotCount: number;
  homes: number;
  checklistDone: number;
  submittedOn: string | null;
  approvedOn: string | null;
  updatedAt: Date;
};

export type ProjectDetail = {
  id: string;
  name: string;
  stage: ProjectStage;
  notes: string;
  submittedOn: string | null;
  approvedOn: string | null;
  parcels: ParcelResult[];
  checklist: { key: ChecklistKey; label: string; done: boolean }[];
  activity: {
    id: string;
    kind: ActivityKind;
    data: ActivityEntry["data"];
    createdAt: Date;
  }[];
};

// submitted_at is a DATE column, which Prisma returns as UTC midnight.
function dayFromDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function dateFromDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function approvedOn(approvedAt: Date | null): string | null {
  return approvedAt ? todayInLA(approvedAt) : null;
}

async function loadOwned<I extends Prisma.ProjectInclude>(
  user: User,
  id: string,
  include?: I,
) {
  const project = await db.project.findUnique({ where: { id }, include });
  if (!project) throw new NotFoundError();
  assertOwner(user, { userId: project.user_id });
  return project as Prisma.ProjectGetPayload<{ include: I }>;
}

// Rows 1 ms apart so entries written together sort in plan order.
async function writeActivity(tx: Tx, projectId: string, entries: ActivityEntry[], now: Date) {
  await tx.activity.createMany({
    data: entries.map((entry, i) => ({
      project_id: projectId,
      kind: entry.kind,
      data: entry.data,
      created_at: new Date(now.getTime() + i),
    })),
  });
}

async function touch(tx: Tx, projectId: string, now: Date) {
  await tx.project.update({ where: { id: projectId }, data: { updated_at: now } });
}

async function applyPlan(projectId: string, plan: Plan, now: Date) {
  if (
    Object.keys(plan.project).length === 0 &&
    plan.items.length === 0 &&
    plan.activity.length === 0
  ) {
    return;
  }

  const data: Prisma.ProjectUpdateInput = { updated_at: now };
  if (plan.project.stage !== undefined) data.stage = plan.project.stage;
  if (plan.project.submittedOn !== undefined) {
    data.submitted_at =
      plan.project.submittedOn === null ? null : dateFromDay(plan.project.submittedOn);
  }
  if (plan.project.approvedAt !== undefined) data.approved_at = plan.project.approvedAt;

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data });
    for (const item of plan.items) {
      const fields = { done: item.done, done_at: item.done ? now : null };
      await tx.checklistItem.upsert({
        where: { project_id_key: { project_id: projectId, key: item.key } },
        update: fields,
        create: { project_id: projectId, key: item.key, ...fields },
      });
    }
    if (plan.activity.length) await writeActivity(tx, projectId, plan.activity, now);
  });
}

async function loadState(user: User, id: string, keys: ChecklistKey[]) {
  const project = await loadOwned(user, id, {
    checklist: { where: { key: { in: keys } } },
  });
  const done = (key: ChecklistKey) =>
    project.checklist.find((row) => row.key === key)?.done ?? false;
  const state: ProjectState = {
    stage: project.stage as ProjectStage,
    submittedOn: dayFromDate(project.submitted_at),
    approvedAt: project.approved_at,
    submittedItemDone: done(SUBMITTED_ITEM),
  };
  return { state, done };
}

export async function listProjects(user: User): Promise<BoardProject[]> {
  const projects = await db.project.findMany({
    where: { user_id: user.id },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      name: true,
      stage: true,
      submitted_at: true,
      approved_at: true,
      updated_at: true,
      parcels: { select: { parcel: { select: { max_homes: true } } } },
      _count: { select: { checklist: { where: { done: true } } } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage as ProjectStage,
    lotCount: p.parcels.length,
    homes: p.parcels.reduce((sum, link) => sum + (link.parcel.max_homes ?? 0), 0),
    checklistDone: p._count.checklist,
    submittedOn: dayFromDate(p.submitted_at),
    approvedOn: approvedOn(p.approved_at),
    updatedAt: p.updated_at,
  }));
}

export async function getProject(user: User, id: string): Promise<ProjectDetail> {
  const project = await loadOwned(user, id, {
    checklist: true,
    activity: { orderBy: { created_at: "desc" } },
  });
  const parcels = await db.$queryRaw<ParcelResult[]>`
    SELECT ${PARCEL_RESULT_COLUMNS}
    FROM parcels JOIN project_parcels pp USING (apn)
    WHERE pp.project_id = ${id}
    ORDER BY pp.created_at, apn
  `;
  const doneByKey = new Map(project.checklist.map((row) => [row.key, row.done]));
  return {
    id: project.id,
    name: project.name,
    stage: project.stage as ProjectStage,
    notes: project.notes,
    submittedOn: dayFromDate(project.submitted_at),
    approvedOn: approvedOn(project.approved_at),
    parcels,
    checklist: CHECKLIST_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      done: doneByKey.get(item.key) ?? false,
    })),
    activity: project.activity.map((row) => ({
      id: row.id,
      kind: row.kind as ActivityKind,
      data: row.data as ActivityEntry["data"],
      createdAt: row.created_at,
    })),
  };
}

export async function projectOptions(
  user: User,
  apn: string,
): Promise<{ id: string; name: string; hasParcel: boolean }[]> {
  const projects = await db.project.findMany({
    where: { user_id: user.id },
    orderBy: { updated_at: "desc" },
    select: { id: true, name: true, parcels: { where: { apn }, select: { apn: true } } },
  });
  return projects.map((p) => ({ id: p.id, name: p.name, hasParcel: p.parcels.length > 0 }));
}

export async function createProject(
  user: User,
  input: { name: string; apns?: string[] },
): Promise<{ id: string }> {
  const requested = [...new Set(input.apns ?? [])];
  const found = requested.length
    ? await db.parcel.findMany({ where: { apn: { in: requested } }, select: { apn: true } })
    : [];
  const existing = new Set(found.map((p) => p.apn));
  const apns = requested.filter((apn) => existing.has(apn));

  const now = new Date();
  const project = await db.$transaction((tx) =>
    tx.project.create({
      data: {
        user_id: user.id,
        name: input.name,
        stage: "found",
        checklist: { create: CHECKLIST_ITEMS.map((item) => ({ key: item.key, done: false })) },
        parcels: {
          create: apns.map((apn, i) => ({ apn, created_at: new Date(now.getTime() + i) })),
        },
        activity: {
          create: [{ kind: "created", data: { parcelCount: apns.length }, created_at: now }],
        },
      },
      select: { id: true },
    }),
  );
  return { id: project.id };
}

export async function addParcels(
  user: User,
  id: string,
  apns: string[],
): Promise<{ added: string[] }> {
  await loadOwned(user, id);
  const requested = [...new Set(apns)];
  const [parcels, linked] = await Promise.all([
    db.parcel.findMany({
      where: { apn: { in: requested } },
      select: { apn: true, address: true },
    }),
    db.projectParcel.findMany({
      where: { project_id: id, apn: { in: requested } },
      select: { apn: true },
    }),
  ]);
  const address = new Map(parcels.map((p) => [p.apn, p.address]));
  const already = new Set(linked.map((l) => l.apn));
  const added = requested.filter((apn) => address.has(apn) && !already.has(apn));
  if (!added.length) return { added };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.projectParcel.createMany({
      data: added.map((apn) => ({ project_id: id, apn })),
      skipDuplicates: true,
    });
    await writeActivity(
      tx,
      id,
      added.map((apn) => ({
        kind: "parcel_added",
        data: { apn, address: address.get(apn) ?? null },
      })),
      now,
    );
    await touch(tx, id, now);
  });
  return { added };
}

export async function removeParcel(user: User, id: string, apn: string): Promise<void> {
  await loadOwned(user, id);
  const link = await db.projectParcel.findUnique({
    where: { project_id_apn: { project_id: id, apn } },
    include: { parcel: { select: { address: true } } },
  });
  if (!link) return;

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.projectParcel.delete({ where: { project_id_apn: { project_id: id, apn } } });
    await writeActivity(
      tx,
      id,
      [{ kind: "parcel_removed", data: { apn, address: link.parcel.address } }],
      now,
    );
    await touch(tx, id, now);
  });
}

export async function renameProject(user: User, id: string, name: string): Promise<void> {
  await loadOwned(user, id);
  await db.project.update({ where: { id }, data: { name } });
}

export async function setNotes(user: User, id: string, notes: string): Promise<void> {
  await loadOwned(user, id);
  await db.project.update({ where: { id }, data: { notes } });
}

export async function setStage(
  user: User,
  id: string,
  stage: ProjectStage,
  submittedOn?: string,
): Promise<void> {
  const { state } = await loadState(user, id, [SUBMITTED_ITEM]);
  const now = new Date();
  await applyPlan(id, planStageChange(state, stage, { submittedOn, now }), now);
}

export async function setChecklistItem(
  user: User,
  id: string,
  key: ChecklistKey,
  done: boolean,
  submittedOn?: string,
): Promise<void> {
  const { state, done: storedDone } = await loadState(user, id, [key, SUBMITTED_ITEM]);
  // The plan only tracks item 8's state, so other no-ops are caught here.
  if (storedDone(key) === done) return;
  const now = new Date();
  await applyPlan(id, planChecklistChange(state, key, done, { submittedOn, now }), now);
}

export async function setSubmittedOn(user: User, id: string, submittedOn: string): Promise<void> {
  const { state } = await loadState(user, id, [SUBMITTED_ITEM]);
  await applyPlan(id, planSubmittedOnChange(state, submittedOn), new Date());
}

export async function deleteProject(user: User, id: string): Promise<void> {
  await loadOwned(user, id);
  await db.project.delete({ where: { id } });
}
