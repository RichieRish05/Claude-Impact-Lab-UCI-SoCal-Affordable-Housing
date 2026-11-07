"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SUBMITTED_ITEM } from "@/lib/projects/checklist";
import { PROJECT_STAGES, STAGE_LABELS, type ProjectStage } from "@/lib/projects/stages";
import { useTRPC } from "@/lib/trpc/client";
import { DatePrompt } from "./date-prompt";
import type { Project } from "./project-detail";

type Props = { project: Project; refresh: () => Promise<void> };

function ProjectName({ project, refresh }: Props) {
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const rename = useMutation(trpc.projects.rename.mutationOptions({ onSuccess: refresh }));

  const start = () => {
    setDraft(project.name);
    setError(null);
    skipBlur.current = false;
    setEditing(true);
  };

  const commit = () => {
    if (skipBlur.current) return;
    skipBlur.current = true;
    setEditing(false);
    const name = draft.trim();
    if (!name || name === project.name) return;
    rename.mutate(
      { id: project.id, name },
      { onError: () => setError("Couldn't rename. Try again.") },
    );
  };

  const cancel = () => {
    skipBlur.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xl font-medium"
      />
    );
  }

  const shown = rename.isPending ? rename.variables.name : project.name;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={start}
        title="Rename"
        className="min-w-0 truncate rounded-md px-1 text-left text-xl font-medium hover:bg-accent"
      >
        {shown}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function StageSelect({ project, refresh }: Props) {
  const trpc = useTRPC();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStage = useMutation(trpc.projects.setStage.mutationOptions({ onSuccess: refresh }));
  const submittedDone =
    project.checklist.find((item) => item.key === SUBMITTED_ITEM)?.done ?? false;

  const move = (stage: ProjectStage, submittedOn?: string) => {
    setError(null);
    setStage.mutate(
      { id: project.id, stage, submittedOn },
      {
        onSuccess: () => setAsking(false),
        onError: (e) => {
          if (e.message === "SUBMISSION_DATE_REQUIRED") setAsking(true);
          else setError("Couldn't change the stage. Try again.");
        },
      },
    );
  };

  const shown: ProjectStage = asking
    ? "application_submitted"
    : setStage.isPending
      ? setStage.variables.stage
      : project.stage;

  return (
    <div className="flex flex-col items-end gap-2">
      <select
        aria-label="Stage"
        value={shown}
        disabled={setStage.isPending || asking}
        onChange={(e) => {
          const stage = e.target.value as ProjectStage;
          if (stage === "application_submitted" && !submittedDone) setAsking(true);
          else move(stage);
        }}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        {PROJECT_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </select>
      {asking && (
        <DatePrompt
          label="Submitted on"
          pending={setStage.isPending}
          onConfirm={(day) => move("application_submitted", day)}
          onCancel={() => {
            setAsking(false);
            setError(null);
          }}
        />
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function DeleteProject({ project }: { project: Project }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation(
    trpc.projects.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        router.push("/projects");
      },
    }),
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-3 py-1 text-sm text-danger hover:bg-accent"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Delete this project?</span>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: project.id })}
        className="rounded-md bg-danger px-3 py-1 text-primary-foreground disabled:opacity-50"
      >
        {remove.isPending ? "Deleting…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted-foreground"
      >
        Cancel
      </button>
      {remove.isError && <span className="text-xs text-danger">Couldn&apos;t delete.</span>}
    </div>
  );
}

export function ProjectHeader({ project, refresh }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/projects" className="w-fit text-sm text-muted-foreground hover:underline">
        ← Projects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ProjectName project={project} refresh={refresh} />
        <div className="flex flex-wrap items-start gap-3">
          <StageSelect project={project} refresh={refresh} />
          <DeleteProject project={project} />
        </div>
      </div>
    </div>
  );
}
