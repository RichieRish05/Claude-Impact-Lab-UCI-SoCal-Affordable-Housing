"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

type Saved = { id: string; name: string };

export function SaveToProject({ apn }: { apn: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useQuery({ ...trpc.projects.options.queryOptions({ apn }), enabled: open });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const done = (project: Saved) => {
    setSaved(project);
    setOpen(false);
    setName("");
    setError(null);
    queryClient.invalidateQueries({ queryKey: trpc.projects.options.pathKey() });
    queryClient.invalidateQueries({ queryKey: trpc.projects.list.pathKey() });
  };
  const fail = () => setError("Could not save. Try again.");

  const add = useMutation(trpc.projects.addParcels.mutationOptions());
  const create = useMutation(trpc.projects.create.mutationOptions());
  const busy = add.isPending || create.isPending;

  const addTo = (project: Saved) => {
    setError(null);
    add.mutate({ id: project.id, apns: [apn] }, { onSuccess: () => done(project), onError: fail });
  };
  const createNew = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    create.mutate(
      { name: trimmed, apns: [apn] },
      { onSuccess: ({ id }) => done({ id, name: trimmed }), onError: fail },
    );
  };

  return (
    <div ref={rootRef} className="relative mb-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          {saved ? `Saved to ${saved.name}` : "Save to project"}
        </button>
        {saved && (
          <Link
            href={`/projects/${saved.id}`}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            View project
          </Link>
        )}
      </div>

      {open && (
        <div
          role="group"
          aria-label="Save to project"
          className="absolute left-0 z-10 mt-1 w-full rounded-md border border-border bg-background p-2 shadow-md"
        >
          {options.isPending && <p className="p-1 text-xs text-muted-foreground">Loading...</p>}
          {options.isError && (
            <p className="p-1 text-xs text-muted-foreground">Could not load projects.</p>
          )}
          {options.data && options.data.length === 0 && (
            <p className="p-1 text-xs text-muted-foreground">No projects yet.</p>
          )}
          <ul className="max-h-40 overflow-y-auto">
            {options.data?.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  disabled={project.hasParcel || busy}
                  onClick={() => addTo(project)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
                >
                  <span className="truncate">{project.name}</span>
                  {project.hasParcel && <span className="shrink-0">Saved</span>}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              createNew();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="New project name"
              aria-label="New project name"
              className="min-w-0 grow rounded border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="shrink-0 cursor-pointer rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:cursor-default disabled:text-muted-foreground"
            >
              Create
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-1.5 text-xs text-muted-foreground">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
