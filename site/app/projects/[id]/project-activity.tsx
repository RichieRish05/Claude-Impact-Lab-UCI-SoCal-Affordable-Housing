import { formatTimestamp } from "@/lib/format";
import { describeActivity } from "@/lib/projects/activity";
import type { Project } from "./project-detail";

export function ProjectActivity({ activity }: { activity: Project["activity"] }) {
  const entries = [...activity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm">
              <p className="text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</p>
              <p className="break-words">{describeActivity(entry)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
