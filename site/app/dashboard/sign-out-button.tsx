"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded border px-3 py-1"
      onClick={async () => {
        await authClient.signOut();
        router.push("/auth/sign-in");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
