"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import type { AppRouter } from "@/app/api/trpc/router";
import { useTRPC } from "@/lib/trpc/client";
import { ProjectActivity } from "./project-activity";
import { ProjectChecklist } from "./project-checklist";
import { ProjectHeader } from "./project-header";
import { ProjectNotes } from "./project-notes";
import { ProjectParcels } from "./project-parcels";
import { ReviewClockPanel } from "./review-clock-panel";

export type Project = inferRouterOutputs<AppRouter>["projects"]["get"];

export function ProjectDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...trpc.projects.get.queryOptions({ id }),
    retry: (count, error) => error.data?.code !== "NOT_FOUND" && count < 3,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id }) }),
      queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() }),
    ]);
  };

  if (query.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading project…</p>;
  }
  if (query.isError) {
    if (query.error.data?.code === "NOT_FOUND") {
      return (
        <div className="flex flex-col gap-2 p-6 text-sm">
          <p className="text-lg font-medium">Project not found</p>
          <Link href="/projects" className="underline">
            Back to projects
          </Link>
        </div>
      );
    }
    return <p className="p-6 text-sm text-danger">Could not load the project.</p>;
  }

  const project = query.data;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <ProjectHeader project={project} refresh={refresh} />
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <ProjectParcels projectId={project.id} parcels={project.parcels} refresh={refresh} />
            <ProjectNotes key={project.id} projectId={project.id} initial={project.notes} refresh={refresh} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            {project.submittedOn && (
              <ReviewClockPanel
                submittedOn={project.submittedOn}
                stage={project.stage}
                approvedOn={project.approvedOn}
              />
            )}
            <ProjectChecklist project={project} refresh={refresh} />
            <ProjectActivity activity={project.activity} />
          </div>
        </div>
      </div>
    </main>
  );
}
