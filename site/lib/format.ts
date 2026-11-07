const integer = new Intl.NumberFormat("en-US");

export function formatCount(n: number, singular: string, plural = `${singular}s`) {
  return `${integer.format(n)} ${n === 1 ? singular : plural}`;
}

export function formatSqft(n: number | null): string {
  return n === null ? "—" : `${integer.format(n)} sq ft`;
}

export function formatFeet(n: number | null): string {
  return n === null ? "—" : `${integer.format(n)} ft`;
}

export function formatDollars(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${trim(n / 1_000)}K`;
  return `$${integer.format(n)}`;
}

export function formatPercent(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// For YYYY-MM-DD calendar days, which carry no time zone.
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

const timestampFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

export function formatTimestamp(value: string | Date): string {
  return timestampFormat.format(new Date(value));
}
