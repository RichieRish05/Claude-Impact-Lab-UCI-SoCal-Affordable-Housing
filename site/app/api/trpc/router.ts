import { protectedProcedure, router } from "./init";
import { parcelsRouter } from "./parcels";

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
  })),
  parcels: parcelsRouter,
});

export type AppRouter = typeof appRouter;
