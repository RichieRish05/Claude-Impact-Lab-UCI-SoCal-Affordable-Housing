"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { formatDay } from "@/lib/format";
import { CHECKLIST_ITEMS, SUBMITTED_ITEM, type ChecklistKey } from "@/lib/projects/checklist";
import { stageIndex } from "@/lib/projects/stages";
import { useTRPC } from "@/lib/trpc/client";
import { DatePrompt } from "./date-prompt";
import type { Project } from "./project-detail";

type Props = { project: Project; refresh: () => Promise<void> };

const SUBMITTED_STAGE = stageIndex("application_submitted");

function SubmittedDate({ project, refresh, submittedOn }: Props & { submittedOn: string }) {
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const update = useMutation(trpc.projects.setSubmittedOn.mutationOptions({ onSuccess: refresh }));

  if (editing) {
    return (
      <DatePrompt
        label="Submitted on"
        initial={submittedOn}
        confirmLabel="Save"
        pending={update.isPending}
        error={update.isError ? "Couldn't save the date." : null}
        onConfirm={(day) =>
          update.mutate(
            { id: project.id, submittedOn: day },
            { onSuccess: () => setEditing(false) },
          )
        }
        onCancel={() => {
          update.reset();
          setEditing(false);
        }}
      />
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Submitted {formatDay(submittedOn)}{" "}
      <button type="button" onClick={() => setEditing(true)} className="underline">
        Edit
      </button>
    </p>
  );
}

export function ProjectChecklist({ project, refresh }: Props) {
  const trpc = useTRPC();
  const [askingDate, setAskingDate] = useState(false);
  const [offerMove, setOfferMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation(
    trpc.projects.setChecklistItem.mutationOptions({ onSuccess: refresh }),
  );
  const setStage = useMutation(trpc.projects.setStage.mutationOptions({ onSuccess: refresh }));

  const done = project.checklist.filter((item) => item.done).length;
  const beforeSubmitted = stageIndex(project.stage) < SUBMITTED_STAGE;

  const save = (key: ChecklistKey, value: boolean, submittedOn?: string) => {
    setError(null);
    toggle.mutate(
      { id: project.id, key, done: value, submittedOn },
      {
        onSuccess: () => {
          if (key !== SUBMITTED_ITEM) return;
          setAskingDate(false);
          setOfferMove(value && beforeSubmitted);
        },
        onError: () => setError("Couldn't save the checklist. Try again."),
      },
    );
  };

  const onChange = (key: ChecklistKey, value: boolean) => {
    if (key === SUBMITTED_ITEM && value) {
      setAskingDate(true);
      return;
    }
    if (key === SUBMITTED_ITEM) setOfferMove(false);
    save(key, value);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium">
        SB 684 checklist · {done}/{CHECKLIST_ITEMS.length}
      </h2>
      <ul className="flex flex-col gap-2">
        {project.checklist.map((item) => {
          const checked = item.done || (item.key === SUBMITTED_ITEM && askingDate);
          return (
            <li key={item.key} className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={toggle.isPending || (item.key === SUBMITTED_ITEM && askingDate)}
                  onChange={(e) => onChange(item.key, e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className={item.done ? "text-muted-foreground" : undefined}>
                  {item.label}
                </span>
              </label>
              {item.key === SUBMITTED_ITEM && (
                <div className="pl-6">
                  {askingDate ? (
                    <DatePrompt
                      label="Submitted on"
                      pending={toggle.isPending}
                      onConfirm={(day) => save(SUBMITTED_ITEM, true, day)}
                      onCancel={() => setAskingDate(false)}
                    />
                  ) : (
                    item.done &&
                    project.submittedOn && (
                      <SubmittedDate
                        project={project}
                        refresh={refresh}
                        submittedOn={project.submittedOn}
                      />
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {offerMove && beforeSubmitted && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary p-3 text-sm">
          <span>Move to Application submitted?</span>
          <button
            type="button"
            disabled={setStage.isPending}
            onClick={() =>
              setStage.mutate(
                { id: project.id, stage: "application_submitted" },
                {
                  onSuccess: () => setOfferMove(false),
                  onError: () => setError("Couldn't change the stage. Try again."),
                },
              )
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
          >
            {setStage.isPending ? "Moving…" : "Move"}
          </button>
          <button
            type="button"
            onClick={() => setOfferMove(false)}
            className="text-sm text-muted-foreground"
          >
            Not now
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
