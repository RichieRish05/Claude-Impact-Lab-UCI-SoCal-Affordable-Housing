import { SUBMITTED_ITEM, type ChecklistKey } from "./checklist";
import { isApprovedOrLater, type ProjectStage } from "./stages";

export class ProjectInputError extends Error {
  constructor(public code: "SUBMISSION_DATE_REQUIRED" | "NOT_SUBMITTED") {
    super(code);
    this.name = "ProjectInputError";
  }
}

export type ProjectState = {
  stage: ProjectStage;
  submittedOn: string | null;
  approvedAt: Date | null;
  submittedItemDone: boolean;
};

export type ActivityKind =
  | "created"
  | "stage_changed"
  | "parcel_added"
  | "parcel_removed"
  | "item_checked"
  | "item_unchecked"
  | "submitted_date_changed";

export type ActivityEntry = {
  kind: ActivityKind;
  data: Record<string, string | number | null>;
};

export type Plan = {
  project: Partial<{ stage: ProjectStage; submittedOn: string | null; approvedAt: Date }>;
  items: { key: ChecklistKey; done: boolean }[];
  activity: ActivityEntry[];
};

type Opts = { submittedOn?: string; now: Date };

const emptyPlan = (): Plan => ({ project: {}, items: [], activity: [] });

export function planStageChange(state: ProjectState, to: ProjectStage, opts: Opts): Plan {
  if (to === state.stage) return emptyPlan();

  const plan = emptyPlan();
  plan.project.stage = to;
  plan.activity.push({ kind: "stage_changed", data: { from: state.stage, to } });

  if (to === "application_submitted" && !state.submittedItemDone) {
    if (!opts.submittedOn) throw new ProjectInputError("SUBMISSION_DATE_REQUIRED");
    plan.project.submittedOn = opts.submittedOn;
    plan.items.push({ key: SUBMITTED_ITEM, done: true });
    plan.activity.push({ kind: "item_checked", data: { key: SUBMITTED_ITEM } });
  }

  if (!isApprovedOrLater(state.stage) && isApprovedOrLater(to)) {
    plan.project.approvedAt = opts.now;
  }
  return plan;
}

export function planChecklistChange(
  state: ProjectState,
  key: ChecklistKey,
  done: boolean,
  opts: Opts,
): Plan {
  const current = key === SUBMITTED_ITEM ? state.submittedItemDone : null;
  if (current === done) return emptyPlan();

  const plan = emptyPlan();
  if (key === SUBMITTED_ITEM) {
    if (done) {
      if (!opts.submittedOn) throw new ProjectInputError("SUBMISSION_DATE_REQUIRED");
      plan.project.submittedOn = opts.submittedOn;
    } else {
      plan.project.submittedOn = null;
    }
  }
  plan.items.push({ key, done });
  plan.activity.push({ kind: done ? "item_checked" : "item_unchecked", data: { key } });
  return plan;
}

export function planSubmittedOnChange(state: ProjectState, submittedOn: string): Plan {
  if (!state.submittedItemDone) throw new ProjectInputError("NOT_SUBMITTED");
  if (state.submittedOn === submittedOn) return emptyPlan();
  return {
    project: { submittedOn },
    items: [],
    activity: [
      { kind: "submitted_date_changed", data: { from: state.submittedOn, to: submittedOn } },
    ],
  };
}
