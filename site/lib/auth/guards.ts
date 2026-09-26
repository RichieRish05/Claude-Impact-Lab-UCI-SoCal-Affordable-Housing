import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/auth/errors";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

export const SIGN_IN_PATH = "/auth/sign-in";

// For route handlers (pair with toErrorResponse) and server actions.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// For pages. Never assumes proxy.ts already ran, but the page must be under
// its matcher so the session cookie gets refreshed.
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
