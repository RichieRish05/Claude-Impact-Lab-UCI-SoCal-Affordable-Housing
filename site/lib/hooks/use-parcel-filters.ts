"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  filtersFromSearchParams,
  filtersToSearchParams,
  type ParcelFilters,
} from "@/lib/parcel-filters";

export function useParcelFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const filters = useMemo(
    () => filtersFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // The History API updates useSearchParams without a server round trip,
  // which router.replace would make on every keystroke.
  const setFilters = useCallback(
    (next: ParcelFilters) => {
      const query = filtersToSearchParams(next).toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  const updateFilters = useCallback(
    (patch: Partial<ParcelFilters>) => setFilters({ ...filters, ...patch }),
    [filters, setFilters],
  );

  return { filters, setFilters, updateFilters };
}
