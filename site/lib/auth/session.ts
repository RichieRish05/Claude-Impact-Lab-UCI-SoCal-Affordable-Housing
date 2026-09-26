import { unstable_rethrow } from "next/navigation";
import { auth } from "@/lib/auth/server";

export type SessionUser = { id: string; email: string; name: string };

// Fails closed: any SDK error or exception is treated as "not signed in".
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const { data, error } = await auth.getSession();
    if (error) {
      console.error("[auth] getSession returned an error", error);
      return null;
    }
    const user = data?.user;
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name };
  } catch (e) {
    // Next's redirect/notFound/dynamic-rendering signals must propagate.
    unstable_rethrow(e);
    console.error("[auth] getSession threw", e);
    return null;
  }
}
