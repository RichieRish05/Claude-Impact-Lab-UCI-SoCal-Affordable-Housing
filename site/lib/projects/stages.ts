export const PROJECT_STAGES = [
  "found",
  "screening",
  "owner_outreach",
  "feasibility",
  "application_submitted",
  "approved",
  "funded",
  "under_construction",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  found: "Found",
  screening: "Screening",
  owner_outreach: "Owner outreach",
  feasibility: "Feasibility",
  application_submitted: "Application submitted",
  approved: "Approved",
  funded: "Funded",
  under_construction: "Under construction",
};

export function stageIndex(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage);
}

export function isApprovedOrLater(stage: ProjectStage): boolean {
  return stageIndex(stage) >= stageIndex("approved");
}
