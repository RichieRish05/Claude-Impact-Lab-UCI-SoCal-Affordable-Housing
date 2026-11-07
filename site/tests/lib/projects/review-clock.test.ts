import { describe, expect, it } from "vitest";
import {
  clockLabel,
  reviewClock,
  todayInLA,
  type ReviewClock,
} from "@/lib/projects/review-clock";

const base = {
  submittedOn: "2026-09-27",
  stage: "application_submitted" as const,
  approvedOn: null,
};

describe("reviewClock", () => {
  it("sets the deadline 60 days after submission", () => {
    expect(reviewClock({ ...base, today: "2026-09-27" })).toEqual({
      kind: "running",
      deadline: "2026-11-26",
      daysLeft: 60,
      tone: "normal",
    });
  });
  it("turns amber at 15 days left", () => {
    expect(reviewClock({ ...base, today: "2026-11-10" })).toMatchObject({
      daysLeft: 16,
      tone: "normal",
    });
    expect(reviewClock({ ...base, today: "2026-11-11" })).toMatchObject({
      daysLeft: 15,
      tone: "warning",
    });
  });
  it("is still running on the deadline day", () => {
    expect(reviewClock({ ...base, today: "2026-11-26" })).toMatchObject({
      kind: "running",
      daysLeft: 0,
    });
  });
  it("is missed the day after the deadline", () => {
    expect(reviewClock({ ...base, today: "2026-11-29" })).toEqual({
      kind: "missed",
      deadline: "2026-11-26",
      daysOver: 3,
    });
  });
  it("stops once approved", () => {
    expect(
      reviewClock({
        ...base,
        stage: "funded",
        approvedOn: "2026-11-20",
        today: "2026-12-30",
      }),
    ).toEqual({
      kind: "stopped",
      deadline: "2026-11-26",
      approvedOn: "2026-11-20",
      daysBeforeDeadline: 6,
    });
  });
  it("runs again after moving back below Approved", () => {
    expect(
      reviewClock({
        ...base,
        stage: "feasibility",
        approvedOn: "2026-11-20",
        today: "2026-11-21",
      }),
    ).toMatchObject({ kind: "running", daysLeft: 5 });
  });
});

describe("todayInLA", () => {
  it("uses the California date, not UTC", () => {
    expect(todayInLA(new Date("2026-11-11T05:00:00Z"))).toBe("2026-11-10");
  });
});

describe("clockLabel", () => {
  it.each([
    [{ kind: "running", deadline: "2026-11-26", daysLeft: 12, tone: "warning" }, "12 days left"],
    [{ kind: "running", deadline: "2026-11-26", daysLeft: 1, tone: "warning" }, "1 day left"],
    [{ kind: "running", deadline: "2026-11-26", daysLeft: 0, tone: "warning" }, "Due today"],
    [{ kind: "missed", deadline: "2026-11-26", daysOver: 3 }, "Missed by 3 days"],
    [{ kind: "stopped", deadline: "2026-11-26", approvedOn: "2026-11-20", daysBeforeDeadline: 6 }, "Approved 6 days before the deadline"],
    [{ kind: "stopped", deadline: "2026-11-26", approvedOn: "2026-11-26", daysBeforeDeadline: 0 }, "Approved on the deadline"],
    [{ kind: "stopped", deadline: "2026-11-26", approvedOn: "2026-11-28", daysBeforeDeadline: -2 }, "Approved 2 days after the deadline"],
  ])("labels %o as %s", (clock, label) =>
    expect(clockLabel(clock as ReviewClock)).toBe(label),
  );
});
