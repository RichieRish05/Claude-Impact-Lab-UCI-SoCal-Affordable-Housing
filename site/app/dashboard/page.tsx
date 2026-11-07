import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/guards";
import { ParcelSearch } from "./parcel-search";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();

  return (
    <div className="flex h-dvh flex-col lg:overflow-hidden">
      <AppHeader email={user.email} current="search" />
      <Suspense>
        <ParcelSearch />
      </Suspense>
    </div>
  );
}
