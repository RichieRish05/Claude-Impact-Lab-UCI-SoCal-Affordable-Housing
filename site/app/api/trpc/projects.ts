import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/auth/errors";
import { CHECKLIST_KEYS } from "@/lib/projects/checklist";
import { ProjectInputError } from "@/lib/projects/rules";
import { PROJECT_STAGES } from "@/lib/projects/stages";
import { protectedProcedure, router } from "./init";
import * as service from "./project-service";

const id = z.string();
const name = z.string().trim().min(1).max(120);
const notes = z.string().max(20_000);
const submittedOn = z.iso.date();
const stage = z.enum(PROJECT_STAGES);
const key = z.enum(CHECKLIST_KEYS);
const apns = z.array(z.string()).min(1).max(50);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND" });
    if (e instanceof ProjectInputError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
    }
    throw e;
  }
}

export const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => run(() => service.listProjects(ctx.user))),

  get: protectedProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => run(() => service.getProject(ctx.user, input.id))),

  options: protectedProcedure
    .input(z.object({ apn: z.string() }))
    .query(({ ctx, input }) => run(() => service.projectOptions(ctx.user, input.apn))),

  create: protectedProcedure
    .input(z.object({ name, apns: apns.optional() }))
    .mutation(({ ctx, input }) => run(() => service.createProject(ctx.user, input))),

  addParcels: protectedProcedure
    .input(z.object({ id, apns }))
    .mutation(({ ctx, input }) =>
      run(() => service.addParcels(ctx.user, input.id, input.apns)),
    ),

  removeParcel: protectedProcedure
    .input(z.object({ id, apn: z.string() }))
    .mutation(({ ctx, input }) =>
      run(() => service.removeParcel(ctx.user, input.id, input.apn)),
    ),

  rename: protectedProcedure
    .input(z.object({ id, name }))
    .mutation(({ ctx, input }) =>
      run(() => service.renameProject(ctx.user, input.id, input.name)),
    ),

  setNotes: protectedProcedure
    .input(z.object({ id, notes }))
    .mutation(({ ctx, input }) => run(() => service.setNotes(ctx.user, input.id, input.notes))),

  setStage: protectedProcedure
    .input(z.object({ id, stage, submittedOn: submittedOn.optional() }))
    .mutation(({ ctx, input }) =>
      run(() => service.setStage(ctx.user, input.id, input.stage, input.submittedOn)),
    ),

  setChecklistItem: protectedProcedure
    .input(z.object({ id, key, done: z.boolean(), submittedOn: submittedOn.optional() }))
    .mutation(({ ctx, input }) =>
      run(() =>
        service.setChecklistItem(ctx.user, input.id, input.key, input.done, input.submittedOn),
      ),
    ),

  setSubmittedOn: protectedProcedure
    .input(z.object({ id, submittedOn }))
    .mutation(({ ctx, input }) =>
      run(() => service.setSubmittedOn(ctx.user, input.id, input.submittedOn)),
    ),

  delete: protectedProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => run(() => service.deleteProject(ctx.user, input.id))),
});
