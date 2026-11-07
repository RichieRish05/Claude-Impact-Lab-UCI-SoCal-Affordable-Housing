import { formatDollars, formatFeet, formatPercent } from "@/lib/format";
import { NEAR_DEFAULT_MI, ZONE_GROUPS, type ParcelFilters } from "@/lib/parcel-filters";

export type ChipKey =
  | "eligible"
  | "vacant"
  | "zones"
  | "lot"
  | "minHomes"
  | "maxValue"
  | "maxTransitFt"
  | "excludeFlood"
  | "neighborhoods"
  | "near";

const CLEARS: Record<ChipKey, Exclude<keyof ParcelFilters, "sort">[]> = {
  eligible: ["eligible"],
  vacant: ["vacant", "minVacantConfidence"],
  zones: ["zones"],
  lot: ["minLotSqft", "maxLotSqft"],
  minHomes: ["minHomes"],
  maxValue: ["maxValue"],
  maxTransitFt: ["maxTransitFt"],
  excludeFlood: ["excludeFlood"],
  neighborhoods: ["neighborhoods"],
  near: ["nearStreet", "nearMi"],
};

const sqft = new Intl.NumberFormat("en-US");

function zoneLabel(zones: string[]): string {
  const selected = [...zones].sort().join();
  for (const [group, codes] of Object.entries(ZONE_GROUPS)) {
    if ([...codes].sort().join() === selected) return group;
  }
  return `Zones ${zones.join(", ")}`;
}

function lotLabel(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) {
    return `Lot ${sqft.format(min)}–${sqft.format(max)} sq ft`;
  }
  return min !== undefined ? `Lot over ${sqft.format(min)} sq ft` : `Lot under ${sqft.format(max!)} sq ft`;
}

export function filterChips(filters: ParcelFilters): { key: ChipKey; label: string }[] {
  const chips: { key: ChipKey; label: string }[] = [];
  const add = (key: ChipKey, label: string) => chips.push({ key, label });

  if (filters.eligible) add("eligible", "SB 684 eligible");
  if (filters.vacant) {
    add(
      "vacant",
      filters.minVacantConfidence === undefined
        ? "Vacant"
        : `Vacant (${formatPercent(filters.minVacantConfidence)}+ sure)`,
    );
  }
  if (filters.zones?.length) add("zones", zoneLabel(filters.zones));
  if (filters.minLotSqft !== undefined || filters.maxLotSqft !== undefined) {
    add("lot", lotLabel(filters.minLotSqft, filters.maxLotSqft));
  }
  if (filters.minHomes !== undefined) add("minHomes", `${filters.minHomes}+ homes`);
  if (filters.maxValue !== undefined) add("maxValue", `Under ${formatDollars(filters.maxValue)} assessed`);
  if (filters.maxTransitFt !== undefined) {
    add("maxTransitFt", `Within ${formatFeet(filters.maxTransitFt)} of transit`);
  }
  if (filters.excludeFlood) add("excludeFlood", "Outside flood zones");
  if (filters.neighborhoods?.length) add("neighborhoods", filters.neighborhoods.join(", "));
  if (filters.nearStreet) {
    add("near", `Within ${filters.nearMi ?? NEAR_DEFAULT_MI} mi of ${filters.nearStreet}`);
  }
  return chips;
}

export function removeChip(filters: ParcelFilters, key: ChipKey): ParcelFilters {
  const next = { ...filters };
  for (const field of CLEARS[key]) delete next[field];
  return next;
}
