import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/guards";
import { ProjectBoard } from "./project-board";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requirePageUser();

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader email={user.email} current="projects" />
      <ProjectBoard />
    </div>
  );
}
