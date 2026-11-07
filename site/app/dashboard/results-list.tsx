"use client";

import { useEffect, useRef } from "react";
import type { ParcelResult } from "@/app/api/trpc/parcels";
import { EligibilityBadge, ParcelCard } from "@/components/parcel-card";
import { SaveToProject } from "@/components/save-to-project";
import { formatSqft } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  parcels: ParcelResult[];
  selectedApn: string | null;
  onSelect: (apn: string | null) => void;
};

export function ResultsList({ parcels, selectedApn, onSelect }: Props) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (selectedApn) {
      itemRefs.current.get(selectedApn)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedApn]);

  if (parcels.length === 0) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        No lots match these filters. Try loosening one.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {parcels.map((parcel) => {
        const selected = parcel.apn === selectedApn;
        return (
          <li
            key={parcel.apn}
            ref={(el) => {
              if (el) itemRefs.current.set(parcel.apn, el);
              else itemRefs.current.delete(parcel.apn);
            }}
            className={cn(selected && "bg-accent")}
          >
            <button
              type="button"
              aria-expanded={selected}
              onClick={() => onSelect(selected ? null : parcel.apn)}
              className="flex w-full cursor-pointer items-start justify-between gap-3 px-5 py-3 text-left hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {parcel.address ?? "No address"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {parcel.apn} · {parcel.zone ?? "—"} · {formatSqft(parcel.lot_sqft)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums">
                  {parcel.max_homes ?? "—"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">homes</span>
                </p>
                <EligibilityBadge eligible={parcel.sb684_eligible} />
              </div>
            </button>
            {selected && (
              <ParcelCard parcel={parcel} actions={<SaveToProject apn={parcel.apn} />} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
