import type { ParcelFilters } from "@/lib/parcel-filters";

// Claude builds its filters from the page as it was when the question was
// sent. Apply only what Claude changed on top of the page now, so a chip the
// user removed while the reply was pending stays removed.
export function mergeAssistantFilters(
  sent: ParcelFilters,
  result: ParcelFilters,
  current: ParcelFilters,
): ParcelFilters {
  const merged: Record<string, unknown> = { ...current };
  const keys = new Set([...Object.keys(sent), ...Object.keys(result)]) as Set<keyof ParcelFilters>;
  for (const key of keys) {
    if (JSON.stringify(sent[key]) === JSON.stringify(result[key])) continue;
    if (result[key] === undefined) delete merged[key];
    else merged[key] = result[key];
  }
  return merged as ParcelFilters;
}
