import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "search", href: "/dashboard", label: "Search" },
  { key: "projects", href: "/projects", label: "Projects" },
] as const;

export function AppHeader({
  email,
  current,
}: {
  email: string;
  current: "search" | "projects";
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
      <div className="flex items-center gap-6">
        <Wordmark />
        <nav className="flex items-center gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={cn(item.key === current && "font-medium")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
