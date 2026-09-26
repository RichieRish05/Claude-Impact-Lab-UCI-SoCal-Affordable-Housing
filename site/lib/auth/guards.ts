import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/auth/errors";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

export const SIGN_IN_PATH = "/auth/sign-in";

// For route handlers and server actions. Pair with toErrorResponse.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// For pages. Never assumes proxy.ts already ran.
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
