import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/lib/auth/session";

const primaryLink = "rounded-md bg-primary px-3 py-2 text-primary-foreground";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="relative z-10 flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <Wordmark />
      <nav className="flex items-center gap-2 text-sm">
        {user ? (
          <Link href="/dashboard" className={primaryLink}>
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/auth/sign-in" className="px-2.5 py-2">
              Sign in
            </Link>
            <Link href="/auth/sign-up" className={primaryLink}>
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
