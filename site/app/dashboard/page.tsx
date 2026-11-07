import { DitherField } from "@/components/ui/dither-field";
import { Wordmark } from "@/components/wordmark";
import { requirePageUser } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();

  return (
    <div className="flex grow flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <Wordmark />
        <SignOutButton />
      </header>
      <main className="mx-auto flex w-full max-w-5xl grow flex-col px-6 py-10">
        <h1 className="text-3xl font-normal tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
        <DitherField
          pattern="horizon"
          color="var(--dither)"
          dotSize={2}
          intensity={0.5}
          speed={0.6}
          className="mt-6 flex min-h-64 grow items-center justify-center rounded-xl border border-border bg-muted"
        >
          <span className="rounded bg-accent px-2.5 py-1.5 font-mono text-xs">
            Your programs will appear here
          </span>
        </DitherField>
      </main>
    </div>
  );
}
