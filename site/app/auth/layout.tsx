import { DitherField } from "@/components/ui/dither-field";
import { Wordmark } from "@/components/wordmark";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <div className="grid grow md:grid-cols-2">
      <aside className="relative hidden border-r border-border bg-muted md:block">
        <DitherField
          pattern="horizon"
          color="var(--dither)"
          dotSize={2}
          intensity={1}
          speed={0.6}
          className="absolute inset-0"
        />
        <div className="absolute top-5 left-6 z-10">
          <Wordmark />
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center gap-6 p-6">
        <div className="md:hidden">
          <Wordmark />
        </div>
        {children}
      </main>
    </div>
  );
}
