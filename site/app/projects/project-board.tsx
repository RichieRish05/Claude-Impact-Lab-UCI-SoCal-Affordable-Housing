"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppRouter } from "@/app/api/trpc/router";
import { formatCount } from "@/lib/format";
import { CHECKLIST_ITEMS } from "@/lib/projects/checklist";
import { clockLabel, reviewClock, todayInLA } from "@/lib/projects/review-clock";
import { isApprovedOrLater, PROJECT_STAGES, STAGE_LABELS } from "@/lib/projects/stages";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type BoardProject = inferRouterOutputs<AppRouter>["projects"]["list"][number];

function Status({ project, today }: { project: BoardProject; today: string }) {
  const { submittedOn } = project;
  const clockApplies =
    project.stage === "application_submitted" || isApprovedOrLater(project.stage);
  if (!submittedOn || !clockApplies) {
    return <span className="text-xs text-muted-foreground">Checklist {project.checklistDone}/{CHECKLIST_ITEMS.length}</span>;
  }
  const clock = reviewClock({
    submittedOn,
    today,
    stage: project.stage,
    approvedOn: project.approvedOn,
  });
  const tone =
    clock.kind === "missed"
      ? "text-danger"
      : clock.kind === "running" && clock.tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return <span className={cn("text-xs", tone)}>{clockLabel(clock)}</span>;
}

function NewProject() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.projects.create.mutationOptions());

  const close = () => {
    setOpen(false);
    setName("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    setError(null);
    create.mutate(
      { name: trimmed },
      {
        onSuccess: ({ id }) => router.push(`/projects/${id}`),
        onError: () => setError("Could not create the project. Try again."),
      },
    );
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        New project
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        maxLength={120}
        placeholder="Project name"
        aria-label="Project name"
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      />
      <button
        type="submit"
        disabled={!name.trim() || create.isPending}
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        {create.isPending ? "Creating…" : "Create"}
      </button>
      <button type="button" onClick={close} className="text-sm text-muted-foreground">
        Cancel
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export function ProjectBoard() {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery(trpc.projects.list.queryOptions());
  const today = todayInLA(new Date());

  const projects: BoardProject[] = data ?? [];
  const sorted = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium">Projects{data ? ` · ${projects.length}` : ""}</h1>
        <NewProject />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : isError ? (
        <p className="text-sm text-danger">Could not load projects.</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet. Save a lot from search to start one.{" "}
          <Link href="/dashboard" className="underline">
            Go to search
          </Link>
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {PROJECT_STAGES.map((stage) => {
            const cards = sorted.filter((p) => p.stage === stage);
            return (
              <section
                key={stage}
                className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-secondary p-2"
              >
                <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                  <span>{STAGE_LABELS[stage]}</span>
                  <span className="text-muted-foreground">{cards.length}</span>
                </h2>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  {cards.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex flex-col gap-1 rounded-md border border-border bg-card p-3"
                    >
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCount(p.lotCount, "lot")} · {formatCount(p.homes, "possible home")}
                      </span>
                      <Status project={p} today={today} />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
