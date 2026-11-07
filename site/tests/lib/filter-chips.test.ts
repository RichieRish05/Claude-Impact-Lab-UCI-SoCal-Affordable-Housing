import { describe, expect, it } from "vitest";
import { filterChips, removeChip } from "@/lib/filter-chips";
import type { ParcelFilters } from "@/lib/parcel-filters";

const labels = (filters: Omit<ParcelFilters, "sort">) =>
  filterChips({ sort: "homes", ...filters }).map((chip) => chip.label);

describe("filterChips", () => {
  it.each<[Omit<ParcelFilters, "sort">, string]>([
    [{ eligible: true }, "SB 684 eligible"],
    [{ vacant: true }, "Vacant"],
    [{ vacant: true, minVacantConfidence: 0.8 }, "Vacant (80%+ sure)"],
    [{ zones: ["RM", "RMH", "RMH-A", "RH"] }, "Multifamily"],
    [{ zones: ["RL"] }, "Single-family"],
    [{ zones: ["RL", "RM"] }, "Zones RL, RM"],
    [{ minLotSqft: 2000, maxLotSqft: 43560 }, "Lot 2,000–43,560 sq ft"],
    [{ minLotSqft: 2000 }, "Lot over 2,000 sq ft"],
    [{ maxLotSqft: 43560 }, "Lot under 43,560 sq ft"],
    [{ minHomes: 4 }, "4+ homes"],
    [{ maxValue: 1_000_000 }, "Under $1M assessed"],
    [{ maxValue: 750_000 }, "Under $750K assessed"],
    [{ maxTransitFt: 1320 }, "Within 1,320 ft of transit"],
    [{ excludeFlood: true }, "Outside flood zones"],
    [{ neighborhoods: ["Oak View"] }, "Oak View"],
    [{ nearStreet: "Beach Blvd" }, "Within 0.5 mi of Beach Blvd"],
    [{ nearStreet: "Beach Blvd", nearMi: 1 }, "Within 1 mi of Beach Blvd"],
  ])("labels %j as %s", (filters, label) => {
    expect(labels(filters)).toEqual([label]);
  });

  it("lists chips in a fixed order", () => {
    expect(labels({ nearStreet: "Beach Blvd", minHomes: 4, eligible: true })).toEqual([
      "SB 684 eligible",
      "4+ homes",
      "Within 0.5 mi of Beach Blvd",
    ]);
  });

  it("never shows sort, or a radius without a street", () => {
    expect(filterChips({ sort: "lot" })).toEqual([]);
    expect(labels({ nearMi: 1 })).toEqual([]);
  });
});

describe("removeChip", () => {
  const all: ParcelFilters = {
    sort: "value",
    eligible: true,
    vacant: true,
    minVacantConfidence: 0.8,
    minLotSqft: 2000,
    maxLotSqft: 43560,
    minHomes: 4,
    nearStreet: "Beach Blvd",
    nearMi: 1,
  };

  it("clears the vacancy threshold with vacant", () => {
    const { vacant, minVacantConfidence, ...rest } = all;
    expect(removeChip(all, "vacant")).toEqual(rest);
    expect([vacant, minVacantConfidence]).toBeDefined();
  });

  it("clears both lot bounds", () => {
    const { minLotSqft, maxLotSqft, ...rest } = all;
    expect(removeChip(all, "lot")).toEqual(rest);
    expect([minLotSqft, maxLotSqft]).toBeDefined();
  });

  it("clears the street and its radius", () => {
    const { nearStreet, nearMi, ...rest } = all;
    expect(removeChip(all, "near")).toEqual(rest);
    expect([nearStreet, nearMi]).toBeDefined();
  });

  it("removes only its own filter", () => {
    const { minHomes, ...rest } = all;
    expect(removeChip(all, "minHomes")).toEqual(rest);
    expect(minHomes).toBe(4);
  });
});
