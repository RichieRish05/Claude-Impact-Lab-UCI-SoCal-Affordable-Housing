"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatCount } from "@/lib/format";
import {
  PARCEL_SORTS,
  SEARCH_PAGE_SIZE,
  SORT_LABELS,
  type ParcelSort,
} from "@/lib/parcel-filters";
import { useParcelFilters } from "@/lib/hooks/use-parcel-filters";
import { useTRPC } from "@/lib/trpc/client";
import { FilterPanel } from "./filter-panel";
import { ParcelMap, resultsKey } from "@/components/parcel-map";
import { ResultsList } from "./results-list";

export function ParcelSearch() {
  const trpc = useTRPC();
  const { filters, setFilters, updateFilters } = useParcelFilters();
  const [selection, setSelection] = useState<{ apn: string; resultsKey: string } | null>(
    null,
  );

  const search = useInfiniteQuery({
    ...trpc.parcels.search.infiniteQueryOptions(filters, {
      initialCursor: 0,
      getNextPageParam: (page) => page.nextCursor,
    }),
    placeholderData: keepPreviousData,
  });
  const options = useQuery(trpc.parcels.filterOptions.queryOptions());

  const pages = search.data?.pages ?? [];
  const firstPage = pages[0];
  const parcels = pages.flatMap((page) => page.parcels);
  // Keyed on the first page so loading more keeps the map's view and selection.
  const currentKey = resultsKey(firstPage?.parcels ?? []);

  // A lot picked from stale results is dropped when new results arrive, so the
  // map's fit to the new results isn't fighting a zoom to the old selection.
  const selectedApn = selection?.resultsKey === currentKey ? selection.apn : null;
  const setSelectedApn = (apn: string | null) =>
    setSelection(apn ? { apn, resultsKey: currentKey } : null);

  return (
    <div className="grid min-h-0 grow grid-rows-[auto_20rem_auto] lg:grid-cols-[17rem_1fr_24rem] lg:grid-rows-1">
      <aside className="border-b border-border lg:overflow-y-auto lg:border-r lg:border-b-0">
        <FilterPanel
          filters={filters}
          onChange={updateFilters}
          onReset={setFilters}
          zones={options.data?.zones ?? []}
          neighborhoods={options.data?.neighborhoods ?? []}
        />
      </aside>

      <section className="relative min-h-0 bg-muted" aria-label="Map">
        <ParcelMap
          parcels={parcels}
          fitKey={currentKey}
          selectedApn={selectedApn}
          onSelect={setSelectedApn}
        />
      </section>

      <section
        aria-label="Results"
        className="flex min-h-0 flex-col border-t border-border lg:border-t-0 lg:border-l"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-sm" aria-live="polite">
            {firstPage ? (
              <>
                <span className="font-medium">{formatCount(firstPage.total, "lot")}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {formatCount(firstPage.totalHomes, "possible home")}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Searching…</span>
            )}
          </p>
          <select
            aria-label="Sort by"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={filters.sort}
            onChange={(e) => updateFilters({ sort: e.target.value as ParcelSort })}
          >
            {PARCEL_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        <div
          className={`min-h-0 grow overflow-y-auto transition-opacity ${search.isPlaceholderData ? "opacity-60" : ""}`}
        >
          {search.isError ? (
            <p className="p-5 text-sm text-red-700">
              Search failed: {search.error.message}
            </p>
          ) : firstPage ? (
            <>
              <ResultsList parcels={parcels} selectedApn={selectedApn} onSelect={setSelectedApn} />
              {search.hasNextPage && (
                <div className="border-t border-border p-4 text-center">
                  <button
                    type="button"
                    onClick={() => search.fetchNextPage()}
                    disabled={search.isFetchingNextPage}
                    className="cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent disabled:cursor-default disabled:opacity-60"
                  >
                    {search.isFetchingNextPage
                      ? "Loading…"
                      : `Show ${Math.min(SEARCH_PAGE_SIZE, firstPage.total - parcels.length)} more`}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Showing {formatCount(parcels.length, "lot")} of {firstPage.total.toLocaleString()}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
