import { formatDay } from "@/lib/format";
import { clockLabel, reviewClock, todayInLA } from "@/lib/projects/review-clock";
import type { ProjectStage } from "@/lib/projects/stages";
import { cn } from "@/lib/utils";

export function ReviewClockPanel({
  submittedOn,
  stage,
  approvedOn,
}: {
  submittedOn: string;
  stage: ProjectStage;
  approvedOn: string | null;
}) {
  const clock = reviewClock({ submittedOn, today: todayInLA(new Date()), stage, approvedOn });
  const tone =
    clock.kind === "missed"
      ? "danger"
      : clock.kind === "running" && clock.tone === "warning"
        ? "warning"
        : null;

  return (
    <section
      aria-label="Review clock"
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-4",
        tone === "danger" && "border-danger bg-danger/10",
        tone === "warning" && "border-warning bg-warning/10",
        tone === null && "border-border bg-card",
      )}
    >
      <p className="text-xs text-muted-foreground">60-day review</p>
      <p
        className={cn(
          "text-2xl font-medium",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {clockLabel(clock)}
      </p>
      <p className="text-xs text-muted-foreground">
        Submitted {formatDay(submittedOn)} · deadline {formatDay(clock.deadline)}
      </p>
    </section>
  );
}
