import { toErrorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/guards";

// Reference pattern for protected API routes: requireUser, then (for owned
// resources) assertOwner, with toErrorResponse mapping auth errors.
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ id: user.id, email: user.email });
  } catch (e) {
    return toErrorResponse(e);
  }
}
