import { CHECKLIST_ITEMS } from "./checklist";
import type { ActivityEntry } from "./rules";
import { STAGE_LABELS, type ProjectStage } from "./stages";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | number | null | undefined): string {
  if (typeof value !== "string") return "none";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

function stageLabel(value: string | number | null | undefined): string {
  return STAGE_LABELS[value as ProjectStage] ?? String(value);
}

function itemLabel(key: string | number | null | undefined): string {
  return CHECKLIST_ITEMS.find((item) => item.key === key)?.label ?? String(key);
}

export function describeActivity(entry: ActivityEntry): string {
  const { kind, data } = entry;
  switch (kind) {
    case "created": {
      const count = Number(data.parcelCount ?? 0);
      return count > 0 ? `Created with ${count} ${count === 1 ? "lot" : "lots"}` : "Created";
    }
    case "stage_changed":
      return `Stage: ${stageLabel(data.from)} → ${stageLabel(data.to)}`;
    case "parcel_added":
      return data.address ? `Added ${data.address} (${data.apn})` : `Added ${data.apn}`;
    case "parcel_removed":
      return data.address ? `Removed ${data.address} (${data.apn})` : `Removed ${data.apn}`;
    case "item_checked":
      return `Checked “${itemLabel(data.key)}”`;
    case "item_unchecked":
      return `Unchecked “${itemLabel(data.key)}”`;
    case "submitted_date_changed":
      return `Submission date: ${formatDate(data.from)} → ${formatDate(data.to)}`;
  }
}
