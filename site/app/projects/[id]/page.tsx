import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/guards";
import { ProjectDetail } from "./project-detail";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await requirePageUser();

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader email={user.email} current="projects" />
      <ProjectDetail id={id} />
    </div>
  );
}
