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
