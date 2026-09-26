import { SIGN_IN_PATH } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

// Optimistic redirect only. Pages and routes still enforce auth via
// lib/auth/guards.ts. Keep /api/*, /auth/* and static assets out of the matcher.
export default auth.middleware({ loginUrl: SIGN_IN_PATH });

export const config = {
  matcher: ["/dashboard/:path*"],
};
