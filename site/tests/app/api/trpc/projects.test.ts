import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(),
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectParcel: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
    },
    parcel: { findMany: vi.fn() },
    checklistItem: { upsert: vi.fn() },
    activity: { createMany: vi.fn() },
  };
  db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db));
  return { db };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createCallerFactory } from "@/app/api/trpc/init";
import { appRouter } from "@/app/api/trpc/router";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CHECKLIST_ITEMS } from "@/lib/projects/checklist";

const caller = createCallerFactory(appRouter)({});
const user = { id: "user_1", email: "a@example.com", name: "Ada" };

function signIn() {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
}

function storedProject(overrides: object = {}) {
  return {
    id: "p1",
    user_id: "user_1",
    name: "HB Starter Homes",
    stage: "found",
    notes: "",
    submitted_at: null,
    approved_at: null,
    created_at: new Date("2026-11-01T00:00:00Z"),
    updated_at: new Date("2026-11-01T00:00:00Z"),
    checklist: [],
    activity: [],
    ...overrides,
  };
}

describe("projects", () => {
  it("rejects signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for another user's project on every procedure", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({ user_id: "someone_else" }) as never,
    );

    const calls = [
      () => caller.projects.get({ id: "p1" }),
      () => caller.projects.rename({ id: "p1", name: "Mine now" }),
      () => caller.projects.setNotes({ id: "p1", notes: "hi" }),
      () => caller.projects.setStage({ id: "p1", stage: "screening" }),
      () => caller.projects.setChecklistItem({ id: "p1", key: "zoning", done: true }),
      () => caller.projects.setSubmittedOn({ id: "p1", submittedOn: "2026-11-07" }),
      () => caller.projects.addParcels({ id: "p1", apns: ["FAKE-001"] }),
      () => caller.projects.removeParcel({ id: "p1", apn: "FAKE-001" }),
      () => caller.projects.delete({ id: "p1" }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.project.delete).not.toHaveBeenCalled();
    expect(db.activity.createMany).not.toHaveBeenCalled();
    expect(db.projectParcel.createMany).not.toHaveBeenCalled();
    expect(db.projectParcel.delete).not.toHaveBeenCalled();
    expect(db.checklistItem.upsert).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a project that doesn't exist", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(null);
    await expect(caller.projects.get({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.projects.delete({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.project.delete).not.toHaveBeenCalled();
  });

  it("creates a project in Found with eight unchecked checklist items", async () => {
    signIn();
    vi.mocked(db.parcel.findMany).mockResolvedValue([]);
    vi.mocked(db.project.create).mockResolvedValue({ id: "p_new" } as never);

    expect(await caller.projects.create({ name: "  HB Starter Homes " })).toEqual({
      id: "p_new",
    });

    const { data } = vi.mocked(db.project.create).mock.calls[0][0] as {
      data: {
        user_id: string;
        name: string;
        stage?: string;
        checklist: { create: { key: string; done?: boolean }[] };
        activity: { create: { kind: string; data: object }[] };
      };
    };
    expect(data.user_id).toBe("user_1");
    expect(data.name).toBe("HB Starter Homes");
    expect(data.stage ?? "found").toBe("found");
    expect(data.checklist.create.map((row) => row.key)).toEqual(
      CHECKLIST_ITEMS.map((item) => item.key),
    );
    expect(data.checklist.create.every((row) => !row.done)).toBe(true);
    expect(data.activity.create).toEqual([
      expect.objectContaining({ kind: "created", data: { parcelCount: 0 } }),
    ]);
  });

  it("creates a project linked to the parcels that exist", async () => {
    signIn();
    vi.mocked(db.parcel.findMany).mockResolvedValue([{ apn: "FAKE-001" }] as never);
    vi.mocked(db.project.create).mockResolvedValue({ id: "p_new" } as never);

    await caller.projects.create({ name: "Lot", apns: ["FAKE-001", "NOPE"] });

    const { data } = vi.mocked(db.project.create).mock.calls[0][0] as {
      data: { parcels: { create: { apn: string }[] }; activity: { create: { data: object }[] } };
    };
    expect(data.parcels.create.map((row) => row.apn)).toEqual(["FAKE-001"]);
    expect(data.activity.create[0].data).toEqual({ parcelCount: 1 });
  });

  it("rejects a blank name", async () => {
    signIn();
    await expect(caller.projects.create({ name: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("adds only parcels that exist and aren't already in the project", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(storedProject() as never);
    vi.mocked(db.parcel.findMany).mockResolvedValue([
      { apn: "FAKE-001", address: "1 Main St" },
      { apn: "FAKE-002", address: "2 Main St" },
    ] as never);
    vi.mocked(db.projectParcel.findMany).mockResolvedValue([{ apn: "FAKE-002" }] as never);

    expect(
      await caller.projects.addParcels({ id: "p1", apns: ["FAKE-001", "FAKE-002", "NOPE"] }),
    ).toEqual({ added: ["FAKE-001"] });

    expect(db.projectParcel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ project_id: "p1", apn: "FAKE-001" }] }),
    );
    const { data } = vi.mocked(db.activity.createMany).mock.calls[0][0] as {
      data: { kind: string; data: object }[];
    };
    expect(data).toEqual([
      expect.objectContaining({
        project_id: "p1",
        kind: "parcel_added",
        data: { apn: "FAKE-001", address: "1 Main St" },
      }),
    ]);
  });

  it("writes nothing when every parcel is already in the project", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(storedProject() as never);
    vi.mocked(db.parcel.findMany).mockResolvedValue([
      { apn: "FAKE-002", address: "2 Main St" },
    ] as never);
    vi.mocked(db.projectParcel.findMany).mockResolvedValue([{ apn: "FAKE-002" }] as never);

    expect(await caller.projects.addParcels({ id: "p1", apns: ["FAKE-002"] })).toEqual({
      added: [],
    });
    expect(db.projectParcel.createMany).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("logs the address when a parcel is removed", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(storedProject() as never);
    vi.mocked(db.projectParcel.findUnique).mockResolvedValue({
      apn: "FAKE-001",
      parcel: { address: "1 Main St" },
    } as never);

    await caller.projects.removeParcel({ id: "p1", apn: "FAKE-001" });

    expect(db.projectParcel.delete).toHaveBeenCalledWith({
      where: { project_id_apn: { project_id: "p1", apn: "FAKE-001" } },
    });
    const { data } = vi.mocked(db.activity.createMany).mock.calls[0][0] as {
      data: { kind: string; data: object }[];
    };
    expect(data).toEqual([
      expect.objectContaining({
        kind: "parcel_removed",
        data: { apn: "FAKE-001", address: "1 Main St" },
      }),
    ]);
  });

  it("rejects Application submitted without a date and writes nothing", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        stage: "feasibility",
        checklist: [{ key: "application_submitted", done: false }],
      }) as never,
    );

    await expect(
      caller.projects.setStage({ id: "p1", stage: "application_submitted" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "SUBMISSION_DATE_REQUIRED" });
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.activity.createMany).not.toHaveBeenCalled();
  });

  it("moves to Application submitted with a date, checks item 8 and logs both in order", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        stage: "feasibility",
        checklist: [{ key: "application_submitted", done: false }],
      }) as never,
    );

    await caller.projects.setStage({
      id: "p1",
      stage: "application_submitted",
      submittedOn: "2026-11-07",
    });

    const update = vi.mocked(db.project.update).mock.calls[0][0] as {
      where: { id: string };
      data: { stage: string; submitted_at: Date };
    };
    expect(update.where).toEqual({ id: "p1" });
    expect(update.data.stage).toBe("application_submitted");
    expect(update.data.submitted_at).toEqual(new Date("2026-11-07T00:00:00Z"));
    expect(db.checklistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project_id_key: { project_id: "p1", key: "application_submitted" } },
        update: expect.objectContaining({ done: true, done_at: expect.any(Date) }),
      }),
    );
    const { data } = vi.mocked(db.activity.createMany).mock.calls[0][0] as {
      data: { kind: string; created_at: Date }[];
    };
    expect(data.map((row) => row.kind)).toEqual(["stage_changed", "item_checked"]);
    expect(data[1].created_at.getTime() - data[0].created_at.getTime()).toBe(1);
  });

  it("writes nothing when the stage doesn't change", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({ stage: "screening", checklist: [] }) as never,
    );
    await caller.projects.setStage({ id: "p1", stage: "screening" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("writes nothing when a checklist item is already in the requested state", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        checklist: [
          { key: "zoning", done: true },
          { key: "application_submitted", done: false },
        ],
      }) as never,
    );
    await caller.projects.setChecklistItem({ id: "p1", key: "zoning", done: true });
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.checklistItem.upsert).not.toHaveBeenCalled();
    expect(db.activity.createMany).not.toHaveBeenCalled();
  });

  it("unchecks item 8 and clears the submission date", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        stage: "application_submitted",
        submitted_at: new Date("2026-11-01T00:00:00Z"),
        checklist: [{ key: "application_submitted", done: true }],
      }) as never,
    );
    await caller.projects.setChecklistItem({
      id: "p1",
      key: "application_submitted",
      done: false,
    });
    const update = vi.mocked(db.project.update).mock.calls[0][0] as {
      data: { submitted_at: Date | null };
    };
    expect(update.data.submitted_at).toBeNull();
    expect(db.checklistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { done: false, done_at: null } }),
    );
  });

  it("writes nothing when the submission date is unchanged", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        stage: "application_submitted",
        submitted_at: new Date("2026-11-01T00:00:00Z"),
        checklist: [{ key: "application_submitted", done: true }],
      }) as never,
    );
    await caller.projects.setSubmittedOn({ id: "p1", submittedOn: "2026-11-01" });
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.activity.createMany).not.toHaveBeenCalled();
  });

  it("rejects a submission date before item 8 is checked", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({ checklist: [{ key: "application_submitted", done: false }] }) as never,
    );
    await expect(
      caller.projects.setSubmittedOn({ id: "p1", submittedOn: "2026-11-01" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "NOT_SUBMITTED" });
  });

  it("rejects a malformed submission date", async () => {
    signIn();
    await expect(
      caller.projects.setSubmittedOn({ id: "p1", submittedOn: "11/01/2026" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("lists only the caller's projects", async () => {
    signIn();
    vi.mocked(db.project.findMany).mockResolvedValue([
      {
        id: "p1",
        name: "HB Starter Homes",
        stage: "approved",
        submitted_at: new Date("2026-09-01T00:00:00Z"),
        approved_at: new Date("2026-10-15T05:00:00Z"),
        updated_at: new Date("2026-10-15T05:00:00Z"),
        parcels: [{ parcel: { max_homes: 4 } }, { parcel: { max_homes: null } }],
        _count: { checklist: 3 },
      },
    ] as never);

    expect(await caller.projects.list()).toEqual([
      {
        id: "p1",
        name: "HB Starter Homes",
        stage: "approved",
        lotCount: 2,
        homes: 4,
        checklistDone: 3,
        submittedOn: "2026-09-01",
        approvedOn: "2026-10-14",
        updatedAt: new Date("2026-10-15T05:00:00Z"),
      },
    ]);
    expect(vi.mocked(db.project.findMany).mock.calls[0][0]).toMatchObject({
      where: { user_id: "user_1" },
    });
  });

  it("returns a project's detail with the checklist in order and parcels from the join", async () => {
    signIn();
    vi.mocked(db.project.findUnique).mockResolvedValue(
      storedProject({
        checklist: [
          { key: "application_submitted", done: false },
          { key: "zoning", done: true },
        ],
        activity: [
          {
            id: "a1",
            kind: "created",
            data: { parcelCount: 1 },
            created_at: new Date("2026-11-01T00:00:00Z"),
          },
        ],
      }) as never,
    );
    vi.mocked(db.$queryRaw).mockResolvedValue([{ apn: "FAKE-001" }] as never);

    const detail = await caller.projects.get({ id: "p1" });

    expect(detail.parcels).toEqual([{ apn: "FAKE-001" }]);
    const [strings] = vi.mocked(db.$queryRaw).mock.calls[0];
    expect((strings as unknown as string[]).join("")).toContain("LEFT JOIN zone_rules");
    expect(detail.checklist.map((item) => item.key)).toEqual(
      CHECKLIST_ITEMS.map((item) => item.key),
    );
    expect(detail.checklist[0]).toEqual({
      key: "zoning",
      label: CHECKLIST_ITEMS[0].label,
      done: true,
    });
    expect(detail.activity).toEqual([
      {
        id: "a1",
        kind: "created",
        data: { parcelCount: 1 },
        createdAt: new Date("2026-11-01T00:00:00Z"),
      },
    ]);
    expect(detail.submittedOn).toBeNull();
    expect(detail.approvedOn).toBeNull();
  });

  it("lists the caller's projects as options, flagging those with the parcel", async () => {
    signIn();
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "p1", name: "A", parcels: [{ apn: "FAKE-001" }] },
      { id: "p2", name: "B", parcels: [] },
    ] as never);

    expect(await caller.projects.options({ apn: "FAKE-001" })).toEqual([
      { id: "p1", name: "A", hasParcel: true },
      { id: "p2", name: "B", hasParcel: false },
    ]);
    expect(vi.mocked(db.project.findMany).mock.calls[0][0]).toMatchObject({
      where: { user_id: "user_1" },
    });
  });
});
