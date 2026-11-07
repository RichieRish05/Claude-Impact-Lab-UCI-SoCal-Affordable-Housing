import { expect, it } from "vitest";
import { CHECKLIST_ITEMS } from "@/lib/projects/checklist";
import {
  isApprovedOrLater,
  PROJECT_STAGES,
  STAGE_LABELS,
} from "@/lib/projects/stages";

it("orders the eight stages as the spec does", () => {
  expect(PROJECT_STAGES.map((s) => STAGE_LABELS[s])).toEqual([
    "Found",
    "Screening",
    "Owner outreach",
    "Feasibility",
    "Application submitted",
    "Approved",
    "Funded",
    "Under construction",
  ]);
});

it("treats Approved and later as approved", () => {
  expect(PROJECT_STAGES.filter(isApprovedOrLater)).toEqual([
    "approved",
    "funded",
    "under_construction",
  ]);
});

it("has eight checklist items ending with the submission item", () => {
  expect(CHECKLIST_ITEMS).toHaveLength(8);
  expect(CHECKLIST_ITEMS.at(-1)).toEqual({
    key: "application_submitted",
    label: "Complete application submitted; record the date",
  });
});
