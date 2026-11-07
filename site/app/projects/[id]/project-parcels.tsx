"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EligibilityBadge, ParcelCard } from "@/components/parcel-card";
import { ParcelMap, resultsKey } from "@/components/parcel-map";
import { formatCount, formatSqft } from "@/lib/format";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { Project } from "./project-detail";

type Parcel = Project["parcels"][number];

function RemoveParcel({
  projectId,
  parcel,
  refresh,
}: {
  projectId: string;
  parcel: Parcel;
  refresh: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation(trpc.projects.removeParcel.mutationOptions({ onSuccess: refresh }));

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${parcel.address ?? parcel.apn}`}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-danger"
      >
        Remove
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs">
      <span>Remove?</span>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: projectId, apn: parcel.apn })}
        className="font-medium text-danger disabled:opacity-50"
      >
        {remove.isPending ? "Removing…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted-foreground"
      >
        Cancel
      </button>
      {remove.isError && <span className="text-danger">Couldn&apos;t remove.</span>}
    </div>
  );
}

export function ProjectParcels({
  projectId,
  parcels,
  refresh,
}: {
  projectId: string;
  parcels: Parcel[];
  refresh: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const selectedApn = parcels.some((p) => p.apn === selection) ? selection : null;
  const homes = parcels.reduce((sum, p) => sum + (p.max_homes ?? 0), 0);

  return (
    <section aria-label="Lots" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        Lots
        <span className="text-muted-foreground">
          {" · "}
          {formatCount(parcels.length, "lot")} · {formatCount(homes, "possible home")}
        </span>
      </h2>

      {parcels.length === 0 ? (
        <p className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
          No lots yet.{" "}
          <Link href="/dashboard" className="underline">
            Add some from search.
          </Link>
        </p>
      ) : (
        <>
          <div className="relative h-80 overflow-hidden rounded-lg border border-border bg-muted">
            <ParcelMap
              parcels={parcels}
              fitKey={resultsKey(parcels)}
              selectedApn={selectedApn}
              onSelect={setSelection}
            />
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {parcels.map((parcel) => {
              const selected = parcel.apn === selectedApn;
              return (
                <li key={parcel.apn} className={cn(selected && "bg-accent")}>
                  <div className="flex items-start gap-2 pr-3">
                    <button
                      type="button"
                      aria-expanded={selected}
                      onClick={() => setSelection(selected ? null : parcel.apn)}
                      className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-3 px-5 py-3 text-left hover:bg-accent"
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
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            homes
                          </span>
                        </p>
                        <EligibilityBadge eligible={parcel.sb684_eligible} />
                      </div>
                    </button>
                    <div className="pt-3">
                      <RemoveParcel projectId={projectId} parcel={parcel} refresh={refresh} />
                    </div>
                  </div>
                  {selected && <ParcelCard parcel={parcel} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">Screening estimate, not legal advice.</p>
    </section>
  );
}
