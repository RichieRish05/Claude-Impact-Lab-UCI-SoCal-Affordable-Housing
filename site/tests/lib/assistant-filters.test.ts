import { describe, expect, it } from "vitest";
import { mergeAssistantFilters } from "@/lib/assistant-filters";
import type { ParcelFilters } from "@/lib/parcel-filters";

describe("mergeAssistantFilters", () => {
  const sent: ParcelFilters = { sort: "homes", eligible: true, minHomes: 4, nearStreet: "Beach Blvd" };

  it("returns Claude's filters when the page didn't change while it worked", () => {
    const result: ParcelFilters = { ...sent, maxValue: 1_000_000 };
    expect(mergeAssistantFilters(sent, result, sent)).toEqual(result);
  });

  it("keeps a chip the user removed while Claude was working", () => {
    const result: ParcelFilters = { ...sent, maxValue: 1_000_000 };
    const current: ParcelFilters = { sort: "homes", eligible: true, nearStreet: "Beach Blvd" };
    expect(mergeAssistantFilters(sent, result, current)).toEqual({
      sort: "homes",
      eligible: true,
      nearStreet: "Beach Blvd",
      maxValue: 1_000_000,
    });
  });

  it("applies filters Claude removed or changed", () => {
    const result: ParcelFilters = { sort: "value", eligible: true, minHomes: 6 };
    expect(mergeAssistantFilters(sent, result, { ...sent, excludeFlood: true })).toEqual({
      sort: "value",
      eligible: true,
      minHomes: 6,
      excludeFlood: true,
    });
  });

  it("compares list filters by value", () => {
    const withZones: ParcelFilters = { ...sent, zones: ["RM", "RMH"] };
    const result: ParcelFilters = { ...withZones, zones: ["RM", "RMH"] };
    const current: ParcelFilters = { ...withZones, zones: ["RL"] };
    expect(mergeAssistantFilters(withZones, result, current).zones).toEqual(["RL"]);
  });
});
