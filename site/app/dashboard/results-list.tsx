"use client";

import { useEffect, useRef, useState } from "react";
import type { ParcelResult } from "@/app/api/trpc/parcels";
import {
  formatDollars,
  formatFeet,
  formatPercent,
  formatSqft,
} from "@/lib/format";
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
            {selected && <ParcelCard parcel={parcel} />}
          </li>
        );
      })}
    </ul>
  );
}

function EligibilityBadge({ eligible }: { eligible: boolean | null }) {
  if (eligible === null) return null;
  return (
    <span
      className={cn(
        "mt-1 inline-block rounded px-1.5 py-0.5 text-[11px]",
        eligible ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {eligible ? "SB 684" : "Not eligible"}
    </span>
  );
}

function CopyableLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <p className={cn("min-w-0 break-words select-text", mono && "font-mono text-xs")}>
        <span className="sr-only">{label}: </span>
        {value ?? `No ${label.toLowerCase()}`}
      </p>
      {value && (
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 cursor-pointer rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      )}
    </div>
  );
}

function ParcelCard({ parcel }: { parcel: ParcelResult }) {
  const facts: [string, string][] = [
    ["Neighborhood", parcel.neighborhood ?? "—"],
    [
      "Vacant",
      parcel.vacant === null
        ? "—"
        : `${parcel.vacant ? "Yes" : "No"} (${formatPercent(parcel.vacant_confidence)} confidence)`,
    ],
    ["Assessed value", formatDollars(parcel.assessed_value)],
    ["Transit", formatFeet(parcel.dist_transit_ft)],
    ["Flood zone", parcel.flood_zone ?? "None"],
  ];

  return (
    <div className="px-5 pb-4 text-sm">
      <div className="mb-3 space-y-1.5 rounded-md border border-border bg-background p-3">
        <CopyableLine label="Address" value={parcel.address} />
        <CopyableLine label="APN" value={parcel.apn} mono />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {parcel.eligibility_reason && (
        <p className="mt-3 rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
          {parcel.eligibility_reason}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Screening estimate, not legal advice.
      </p>
    </div>
  );
}
