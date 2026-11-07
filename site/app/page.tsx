import Link from "next/link";
import { DitherField } from "@/components/ui/dither-field";
import { SiteHeader } from "@/components/site-header";

// SiteHeader reads the session cookie, so this must render per request.
export const dynamic = "force-dynamic";

const trustPoints = [
  "Eligibility decided by code, not AI guesses",
  "Every rule links to its source",
  "Never asks for your SSN or bank details",
];

export default function Home() {
  return (
    <div className="flex grow flex-col">
      <SiteHeader />

      <main className="relative flex grow items-center overflow-hidden px-6 py-20 sm:px-12">
        <DitherField
          pattern="waves"
          color="var(--dither)"
          dotSize={2}
          intensity={0.72}
          speed={0.6}
          className="absolute inset-0 opacity-40 [mask-image:linear-gradient(to_right,transparent_55%,black_95%)] md:opacity-100 md:[mask-image:linear-gradient(to_right,transparent_52%,black_75%)]"
        />
        <div className="relative z-10 max-w-3xl">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            Down payment assistance
            <span className="rounded bg-accent px-1.5 py-1 font-mono text-foreground">
              California
            </span>
          </p>
          <h1 className="mt-5 text-5xl leading-none font-normal tracking-tighter sm:text-7xl">
            Every program.
            <br />
            One plan home.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-snug text-muted-foreground sm:text-xl">
            Answer a few questions and see the assistance you qualify for, how
            it stacks, and what to apply for first.
          </p>
          <Link
            href="/auth/sign-up"
            className="mt-7 inline-flex h-13 items-center rounded-lg bg-brand px-6 font-medium text-brand-foreground"
          >
            Check what you qualify for
          </Link>
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-background px-6 py-3.5 text-xs text-muted-foreground sm:px-12">
        {trustPoints.map((point) => (
          <span key={point}>{point}</span>
        ))}
      </footer>
    </div>
  );
}
