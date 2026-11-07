import { z } from "zod";

export const PARCEL_SORTS = ["homes", "lot", "value", "transit"] as const;
export type ParcelSort = (typeof PARCEL_SORTS)[number];

export const SORT_LABELS: Record<ParcelSort, string> = {
  homes: "Possible homes",
  lot: "Lot size",
  value: "Assessed value",
  transit: "Distance to transit",
};

// Mirrors zone_rules.rules_json.housing_type; RMP is a mobile-home park zone.
export const ZONE_GROUPS = {
  "Single-family": ["RL"],
  Multifamily: ["RM", "RMH", "RMH-A", "RH"],
} as const satisfies Record<string, readonly string[]>;

export const SEARCH_PAGE_SIZE = 200;

export const NEAR_DEFAULT_MI = 0.5;

const count = z.number().int().nonnegative();

export const parcelFiltersSchema = z.object({
  eligible: z.boolean().optional(),
  vacant: z.boolean().optional(),
  minVacantConfidence: z.number().min(0).max(1).optional(),
  zones: z.array(z.string().min(1)).max(50).optional(),
  minLotSqft: count.optional(),
  maxLotSqft: count.optional(),
  minHomes: z.number().int().min(1).max(10).optional(),
  maxValue: count.optional(),
  maxTransitFt: count.optional(),
  excludeFlood: z.boolean().optional(),
  neighborhoods: z.array(z.string().min(1)).max(50).optional(),
  nearStreet: z.string().trim().min(1).max(80).optional(),
  nearMi: z.number().min(0.1).max(2).optional(),
  sort: z.enum(PARCEL_SORTS).default("homes"),
});

export type ParcelFilters = z.infer<typeof parcelFiltersSchema>;

// The cursor is a row offset. It stays out of the filter schema so it never
// lands in the URL or in the LLM tool's arguments.
export const parcelSearchInputSchema = parcelFiltersSchema.extend({
  cursor: z.number().int().nonnegative().default(0),
});

export const DEFAULT_FILTERS: ParcelFilters = { sort: "homes" };

type Field = Exclude<keyof ParcelFilters, "sort">;

const PARAM: Record<Field, string> = {
  eligible: "eligible",
  vacant: "vacant",
  minVacantConfidence: "conf",
  zones: "zone",
  minLotSqft: "lotMin",
  maxLotSqft: "lotMax",
  minHomes: "homes",
  maxValue: "value",
  maxTransitFt: "transit",
  excludeFlood: "noFlood",
  neighborhoods: "hood",
  nearStreet: "street",
  nearMi: "mi",
};

const BOOLEAN_FIELDS = ["eligible", "vacant", "excludeFlood"] as const;
const NUMBER_FIELDS = [
  "minVacantConfidence",
  "minLotSqft",
  "maxLotSqft",
  "minHomes",
  "maxValue",
  "maxTransitFt",
  "nearMi",
] as const;
const LIST_FIELDS = ["zones", "neighborhoods"] as const;

// URLs get hand-edited and shared, so a bad value drops that one filter
// instead of failing the whole search.
export function filtersFromSearchParams(params: URLSearchParams): ParcelFilters {
  const filters: ParcelFilters = { ...DEFAULT_FILTERS };
  const shape = parcelFiltersSchema.shape;

  const sort = shape.sort.safeParse(params.get("sort") ?? undefined);
  if (sort.success) filters.sort = sort.data;

  for (const field of BOOLEAN_FIELDS) {
    if (params.get(PARAM[field]) === "1") filters[field] = true;
  }
  for (const field of NUMBER_FIELDS) {
    const raw = params.get(PARAM[field]);
    if (raw === null || raw.trim() === "") continue;
    const parsed = shape[field].safeParse(Number(raw));
    if (parsed.success) filters[field] = parsed.data;
  }
  for (const field of LIST_FIELDS) {
    const values = [...new Set(params.getAll(PARAM[field]).filter(Boolean))];
    if (values.length === 0) continue;
    const parsed = shape[field].safeParse(values);
    if (parsed.success) filters[field] = parsed.data;
  }
  const street = shape.nearStreet.safeParse(params.get(PARAM.nearStreet) ?? undefined);
  if (street.success && street.data !== undefined) filters.nearStreet = street.data;
  else delete filters.nearMi;
  return filters;
}

export function filtersToSearchParams(filters: ParcelFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of BOOLEAN_FIELDS) {
    if (filters[field]) params.set(PARAM[field], "1");
  }
  for (const field of NUMBER_FIELDS) {
    const value = filters[field];
    if (value !== undefined) params.set(PARAM[field], String(value));
  }
  for (const field of LIST_FIELDS) {
    for (const value of filters[field] ?? []) params.append(PARAM[field], value);
  }
  if (filters.nearStreet) params.set(PARAM.nearStreet, filters.nearStreet);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  return params;
}

export function countActiveFilters(filters: ParcelFilters): number {
  return (Object.keys(PARAM) as Field[]).filter((field) => {
    const value = filters[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false;
  }).length;
}
