import { initTRPC, TRPCError } from "@trpc/server";
import { UnauthorizedError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/guards";

export async function createTRPCContext() {
  return {};
}

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ next }) => {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    throw e;
  }
  return next({ ctx: { user } });
});
