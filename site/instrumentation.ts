// Runs once at server start. Loading the auth module here makes a missing or
// invalid auth config fail the boot instead of a user's first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/auth/server");
  }
}
