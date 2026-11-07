import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  type ParcelFilters,
} from "@/lib/parcel-filters";

const parse = (query: string) => filtersFromSearchParams(new URLSearchParams(query));

describe("parcel filters in the URL", () => {
  it("defaults to no filters, sorted by possible homes", () => {
    expect(parse("")).toEqual({ sort: "homes" });
    expect(filtersToSearchParams({ sort: "homes" }).toString()).toBe("");
  });

  it("round-trips every filter", () => {
    const filters: ParcelFilters = {
      eligible: true,
      vacant: true,
      minVacantConfidence: 0.75,
      zones: ["RL", "RM"],
      minLotSqft: 5000,
      maxLotSqft: 43560,
      minHomes: 4,
      maxValue: 1_000_000,
      maxTransitFt: 1320,
      excludeFlood: true,
      neighborhoods: ["Oak View", "Downtown"],
      sort: "transit",
    };
    expect(filtersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });

  it("drops invalid values instead of failing the whole search", () => {
    expect(parse("homes=11&lotMin=-5&conf=2&value=abc&sort=bogus&eligible=yes&vacant=1")).toEqual({
      sort: "homes",
      vacant: true,
    });
  });

  it("dedupes and ignores empty list values", () => {
    expect(parse("zone=RL&zone=RL&zone=&hood=Downtown").zones).toEqual(["RL"]);
  });

  it("counts active filters, ignoring sort", () => {
    expect(countActiveFilters({ sort: "lot" })).toBe(0);
    expect(countActiveFilters({ sort: "homes", eligible: true, zones: [], minHomes: 4 })).toBe(2);
  });
});
