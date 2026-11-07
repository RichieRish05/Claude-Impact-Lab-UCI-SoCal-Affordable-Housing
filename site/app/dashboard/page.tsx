import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { requirePageUser } from "@/lib/auth/guards";
import { ParcelSearch } from "./parcel-search";
import { SignOutButton } from "./sign-out-button";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();

  return (
    <div className="flex h-dvh flex-col lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
        <div className="flex items-center gap-6">
          <Wordmark />
          <nav className="text-sm">
            <span className="font-medium">Search</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <Suspense>
        <ParcelSearch />
      </Suspense>
    </div>
  );
}
