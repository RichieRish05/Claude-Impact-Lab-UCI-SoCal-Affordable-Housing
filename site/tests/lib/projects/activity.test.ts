import { expect, it } from "vitest";
import { describeActivity } from "@/lib/projects/activity";
import type { ActivityEntry } from "@/lib/projects/rules";

it.each([
  [{ kind: "created", data: { parcelCount: 3 } }, "Created with 3 lots"],
  [{ kind: "created", data: { parcelCount: 0 } }, "Created"],
  [{ kind: "stage_changed", data: { from: "found", to: "screening" } }, "Stage: Found → Screening"],
  [{ kind: "parcel_added", data: { apn: "FAKE-001", address: "1234 Main St" } }, "Added 1234 Main St (FAKE-001)"],
  [{ kind: "parcel_removed", data: { apn: "FAKE-001", address: null } }, "Removed FAKE-001"],
  [{ kind: "item_checked", data: { key: "tentative_map" } }, "Checked “Tentative parcel map prepared”"],
  [{ kind: "submitted_date_changed", data: { from: "2026-11-01", to: "2026-11-02" } }, "Submission date: Nov 1, 2026 → Nov 2, 2026"],
])("describes %o", (entry, text) => expect(describeActivity(entry as ActivityEntry)).toBe(text));
