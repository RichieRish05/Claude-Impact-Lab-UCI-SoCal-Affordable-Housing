import { describe, expect, it } from "vitest";
import {
  planChecklistChange,
  planStageChange,
  planSubmittedOnChange,
  type ProjectState,
} from "@/lib/projects/rules";

const now = new Date("2026-11-07T18:00:00Z");
const found: ProjectState = { stage: "found", submittedOn: null, approvedAt: null, submittedItemDone: false };

describe("project rules", () => {
  it("refuses Application submitted without a date when item 8 is unchecked", () => {
    expect(() => planStageChange(found, "application_submitted", { now })).toThrow(expect.objectContaining({ code: "SUBMISSION_DATE_REQUIRED" }));
  });
  it("moving to Application submitted records the date and checks item 8", () => {
    expect(planStageChange(found, "application_submitted", { now, submittedOn: "2026-11-01" })).toEqual({
      project: { stage: "application_submitted", submittedOn: "2026-11-01" },
      items: [{ key: "application_submitted", done: true }],
      activity: [
        { kind: "stage_changed", data: { from: "found", to: "application_submitted" } },
        { kind: "item_checked", data: { key: "application_submitted" } },
      ],
    });
  });
  it("needs no date when item 8 is already checked", () => {
    const plan = planStageChange({ ...found, submittedItemDone: true, submittedOn: "2026-11-01" }, "application_submitted", { now });
    expect(plan.project).toEqual({ stage: "application_submitted" });
    expect(plan.items).toEqual([]);
  });
  it("records the approval time when skipping straight to Funded", () => {
    expect(planStageChange(found, "funded", { now }).project).toEqual({ stage: "funded", approvedAt: now });
  });
  it("keeps the approval time when moving back down, and overwrites it on the next approval", () => {
    const approved = { ...found, stage: "approved" as const, approvedAt: new Date("2026-10-01") };
    expect(planStageChange(approved, "feasibility", { now }).project).toEqual({ stage: "feasibility" });
    expect(planStageChange({ ...approved, stage: "feasibility" }, "approved", { now }).project).toEqual({ stage: "approved", approvedAt: now });
    expect(planStageChange(approved, "funded", { now }).project).toEqual({ stage: "funded" });
  });
  it("is a no-op for the current stage", () => {
    expect(planStageChange(found, "found", { now })).toEqual({ project: {}, items: [], activity: [] });
  });
  it("unchecking item 8 clears the date but keeps the stage", () => {
    const submitted = { ...found, stage: "application_submitted" as const, submittedOn: "2026-11-01", submittedItemDone: true };
    expect(planChecklistChange(submitted, "application_submitted", false, { now })).toEqual({
      project: { submittedOn: null },
      items: [{ key: "application_submitted", done: false }],
      activity: [{ kind: "item_unchecked", data: { key: "application_submitted" } }],
    });
  });
  it("checking item 8 requires a date and doesn't move the stage", () => {
    expect(() => planChecklistChange(found, "application_submitted", true, { now })).toThrow(expect.objectContaining({ code: "SUBMISSION_DATE_REQUIRED" }));
    expect(planChecklistChange(found, "application_submitted", true, { now, submittedOn: "2026-11-01" }).project).toEqual({ submittedOn: "2026-11-01" });
  });
  it("editing the date requires item 8 and logs the change", () => {
    expect(() => planSubmittedOnChange(found, "2026-11-02")).toThrow(expect.objectContaining({ code: "NOT_SUBMITTED" }));
    const submitted = { ...found, submittedOn: "2026-11-01", submittedItemDone: true };
    expect(planSubmittedOnChange(submitted, "2026-11-02").activity).toEqual([{ kind: "submitted_date_changed", data: { from: "2026-11-01", to: "2026-11-02" } }]);
  });
  it("toggles an ordinary item", () => {
    expect(planChecklistChange(found, "zoning", true, { now })).toEqual({
      project: {},
      items: [{ key: "zoning", done: true }],
      activity: [{ kind: "item_checked", data: { key: "zoning" } }],
    });
  });
  it("ignores a no-op toggle of item 8", () => {
    expect(planChecklistChange(found, "application_submitted", false, { now })).toEqual({ project: {}, items: [], activity: [] });
  });
});
