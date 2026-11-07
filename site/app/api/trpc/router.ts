import { assistantRouter } from "./assistant";
import { protectedProcedure, router } from "./init";
import { parcelsRouter } from "./parcels";

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
  })),
  parcels: parcelsRouter,
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;
