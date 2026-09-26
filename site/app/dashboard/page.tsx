import { requirePageUser } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();

  return (
    <main className="flex grow flex-col items-center justify-center gap-4 p-4">
      <p>Signed in as {user.email}</p>
      <SignOutButton />
    </main>
  );
}
