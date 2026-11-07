"use client";

import { filterChips, removeChip } from "@/lib/filter-chips";
import type { ParcelFilters } from "@/lib/parcel-filters";

type Props = {
  filters: ParcelFilters;
  onChange: (filters: ParcelFilters) => void;
};

export function FilterChips({ filters, onChange }: Props) {
  const chips = filterChips(filters);
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <li
          key={chip.key}
          className="flex items-center gap-1 rounded-full border border-primary/40 bg-background py-0.5 pr-1 pl-2.5 text-xs shadow-sm"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onChange(removeChip(filters, chip.key))}
            className="flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
