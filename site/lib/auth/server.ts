import { createNeonAuth } from "@neondatabase/auth/next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// The only server-side import of the Neon Auth SDK. Everything else reads the
// session through lib/auth/session.ts.
export const auth = createNeonAuth({
  baseUrl: requireEnv("NEON_AUTH_BASE_URL"),
  cookies: { secret: requireEnv("NEON_AUTH_COOKIE_SECRET") },
});
