"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAutosave } from "@/lib/hooks/use-autosave";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const STATUS_TEXT = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
} as const;

export function ProjectNotes({
  projectId,
  initial,
  refresh,
}: {
  projectId: string;
  initial: string;
  refresh: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [notes, setNotes] = useState(initial);
  const save = useMutation(trpc.projects.setNotes.mutationOptions({ onSuccess: refresh }));
  const status = useAutosave(notes, (v) => save.mutateAsync({ id: projectId, notes: v }));

  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="project-notes" className="text-sm font-medium">
        Notes
      </label>
      <textarea
        id="project-notes"
        value={notes}
        maxLength={20_000}
        rows={6}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything worth remembering about this project"
        className="rounded-lg border border-input bg-background p-3 text-sm"
      />
      <p
        aria-live="polite"
        className={cn(
          "h-4 text-xs",
          status === "error" ? "text-danger" : "text-muted-foreground",
        )}
      >
        {STATUS_TEXT[status]}
      </p>
    </section>
  );
}
