"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  NEAR_DEFAULT_MI,
  ZONE_GROUPS,
  type ParcelFilters,
} from "@/lib/parcel-filters";

type Props = {
  filters: ParcelFilters;
  onChange: (patch: Partial<ParcelFilters>) => void;
  onReset: (filters: ParcelFilters) => void;
  zones: string[];
  neighborhoods: string[];
};

const RADIUS_OPTIONS = [0.25, 0.5, 1, 2];

const CONFIDENCE_OPTIONS = [
  { label: "Any confidence", value: undefined },
  { label: "50%+ confident", value: 0.5 },
  { label: "75%+ confident", value: 0.75 },
  { label: "90%+ confident", value: 0.9 },
];

export function FilterPanel({ filters, onChange, onReset, zones, neighborhoods }: Props) {
  const active = countActiveFilters(filters);

  return (
    <div className="flex flex-col gap-6 p-5 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Filters</h2>
        {active > 0 && (
          <button
            type="button"
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onReset({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            Clear {active}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          label="SB 684 eligible"
          checked={!!filters.eligible}
          onChange={(eligible) => onChange({ eligible: eligible || undefined })}
        />
        <Toggle
          label="Vacant"
          checked={!!filters.vacant}
          onChange={(vacant) =>
            onChange(
              vacant
                ? { vacant: true }
                : { vacant: undefined, minVacantConfidence: undefined },
            )
          }
        />
        {filters.vacant && (
          <select
            aria-label="Vacancy confidence"
            className={cn(inputClass, "ml-11 w-auto")}
            value={filters.minVacantConfidence ?? ""}
            onChange={(e) =>
              onChange({
                minVacantConfidence: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          >
            {CONFIDENCE_OPTIONS.map((o) => (
              <option key={o.label} value={o.value ?? ""}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <Toggle
          label="Exclude flood zones"
          checked={!!filters.excludeFlood}
          onChange={(excludeFlood) => onChange({ excludeFlood: excludeFlood || undefined })}
        />
      </div>

      <Section label="Zone">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ZONE_GROUPS).map(([group, codes]) => {
            const selected = new Set(filters.zones);
            const on = codes.every((c) => selected.has(c));
            return (
              <Chip
                key={group}
                selected={on}
                onClick={() => {
                  for (const c of codes) {
                    if (on) selected.delete(c);
                    else selected.add(c);
                  }
                  onChange({ zones: listOrUndefined([...selected]) });
                }}
              >
                {group}
              </Chip>
            );
          })}
        </div>
        <MultiSelect
          options={zones}
          selected={filters.zones}
          onChange={(zones) => onChange({ zones })}
          mono
        />
      </Section>

      <Section label="Lot size (sq ft)">
        <div className="flex items-center gap-2">
          <NumberField
            label="Minimum lot size"
            placeholder="Min"
            value={filters.minLotSqft}
            onChange={(minLotSqft) => onChange({ minLotSqft })}
          />
          <span className="text-muted-foreground">to</span>
          <NumberField
            label="Maximum lot size"
            placeholder="Max"
            value={filters.maxLotSqft}
            onChange={(maxLotSqft) => onChange({ maxLotSqft })}
          />
        </div>
      </Section>

      <Section label="Possible homes">
        <select
          aria-label="Minimum possible homes"
          className={inputClass}
          value={filters.minHomes ?? ""}
          onChange={(e) =>
            onChange({ minHomes: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">Any</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 10 ? "10" : `${n}+`} homes
            </option>
          ))}
        </select>
      </Section>

      <Section label="Max assessed value ($)">
        <NumberField
          label="Maximum assessed value"
          placeholder="No limit"
          value={filters.maxValue}
          onChange={(maxValue) => onChange({ maxValue })}
        />
      </Section>

      <Section label="Max distance to transit (ft)">
        <NumberField
          label="Maximum distance to transit"
          placeholder="No limit"
          value={filters.maxTransitFt}
          onChange={(maxTransitFt) => onChange({ maxTransitFt })}
        />
      </Section>

      <Section label="Near a street">
        <StreetField
          value={filters.nearStreet}
          onChange={(nearStreet) =>
            onChange(nearStreet ? { nearStreet } : { nearStreet: undefined, nearMi: undefined })
          }
        />
        <select
          aria-label="Distance from the street"
          className={inputClass}
          disabled={!filters.nearStreet}
          value={filters.nearMi ?? NEAR_DEFAULT_MI}
          onChange={(e) => {
            const mi = Number(e.target.value);
            onChange({ nearMi: mi === NEAR_DEFAULT_MI ? undefined : mi });
          }}
        >
          {RADIUS_OPTIONS.map((mi) => (
            <option key={mi} value={mi}>
              Within {mi} mi
            </option>
          ))}
        </select>
      </Section>

      <Section label="Neighborhood">
        <MultiSelect
          options={neighborhoods}
          selected={filters.neighborhoods}
          onChange={(neighborhoods) => onChange({ neighborhoods })}
        />
      </Section>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 outline-none focus:border-ring";

function listOrUndefined(values: string[]) {
  return values.length ? values : undefined;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-8 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
            checked && "translate-x-3",
          )}
        />
      </button>
      {label}
    </label>
  );
}

function Chip({
  selected,
  onClick,
  mono,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
        mono && "font-mono",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  mono,
}: {
  options: string[];
  selected: string[] | undefined;
  onChange: (values: string[] | undefined) => void;
  mono?: boolean;
}) {
  const set = new Set(selected);
  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Chip
          key={option}
          mono={mono}
          selected={set.has(option)}
          onClick={() => {
            if (set.has(option)) set.delete(option);
            else set.add(option);
            onChange(listOrUndefined(options.filter((o) => set.has(o))));
          }}
        >
          {option}
        </Chip>
      ))}
    </div>
  );
}

// Commits on blur or Enter, because every change runs a search.
function StreetField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value ?? "");
  }
  const commit = () => {
    const next = text.trim() || undefined;
    if (next !== value) onChange(next);
  };

  return (
    <input
      aria-label="Street name"
      placeholder="e.g. Beach Blvd"
      className={inputClass}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function NumberField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const committed = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Follow outside changes (clear, back/forward) without clobbering typing.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value?.toString() ?? "");
    }
  }, [value]);

  useEffect(() => {
    const digits = text.replace(/[^\d]/g, "");
    const next = digits ? Number(digits) : undefined;
    if (next === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = next;
      onChangeRef.current(next);
    }, 400);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <input
      aria-label={label}
      inputMode="numeric"
      placeholder={placeholder}
      className={inputClass}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
