import { isApprovedOrLater, type ProjectStage } from "@/lib/projects/stages";

export const REVIEW_DAYS = 60;
export const WARNING_DAYS = 15;

const DAY_MS = 86_400_000;

export type ReviewClock =
  | { kind: "running"; deadline: string; daysLeft: number; tone: "normal" | "warning" }
  | { kind: "missed"; deadline: string; daysOver: number }
  | { kind: "stopped"; deadline: string; approvedOn: string; daysBeforeDeadline: number };

export function todayInLA(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now);
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function reviewClock(input: {
  submittedOn: string;
  today: string;
  stage: ProjectStage;
  approvedOn: string | null;
}): ReviewClock {
  const deadline = addDays(input.submittedOn, REVIEW_DAYS);
  if (isApprovedOrLater(input.stage) && input.approvedOn !== null) {
    return {
      kind: "stopped",
      deadline,
      approvedOn: input.approvedOn,
      daysBeforeDeadline: daysBetween(input.approvedOn, deadline),
    };
  }
  const daysLeft = daysBetween(input.today, deadline);
  if (daysLeft < 0) return { kind: "missed", deadline, daysOver: -daysLeft };
  return {
    kind: "running",
    deadline,
    daysLeft,
    tone: daysLeft <= WARNING_DAYS ? "warning" : "normal",
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function clockLabel(clock: ReviewClock): string {
  switch (clock.kind) {
    case "running":
      return clock.daysLeft === 0 ? "Due today" : `${plural(clock.daysLeft, "day")} left`;
    case "missed":
      return `Missed by ${plural(clock.daysOver, "day")}`;
    case "stopped":
      if (clock.daysBeforeDeadline === 0) return "Approved on the deadline";
      return clock.daysBeforeDeadline > 0
        ? `Approved ${plural(clock.daysBeforeDeadline, "day")} before the deadline`
        : `Approved ${plural(-clock.daysBeforeDeadline, "day")} after the deadline`;
  }
}
