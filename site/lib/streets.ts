export const SUFFIXES: Record<string, readonly string[]> = {
  blvd: ["blvd", "boulevard"],
  st: ["st", "street"],
  ave: ["ave", "avenue"],
  dr: ["dr", "drive"],
  ln: ["ln", "lane"],
  rd: ["rd", "road"],
  cir: ["cir", "circle"],
  ct: ["ct", "court"],
  pl: ["pl", "place"],
  way: ["way"],
  hwy: ["hwy", "highway"],
};

const SUFFIX_BY_SPELLING = new Map(
  Object.entries(SUFFIXES).flatMap(([canonical, spellings]) =>
    spellings.map((spelling) => [spelling, canonical] as const),
  ),
);

const DIRECTIONS = new Set(["n", "s", "e", "w"]);

// Names locals use that don't appear in parcel addresses.
const ALIASES: Record<string, string> = { pch: "pacific coast hwy" };

export function normalizeStreet(name: string): { base: string; suffix: string | null } | null {
  const cleaned = name.toLowerCase().replace(/[.,]/g, " ").trim();
  const tokens = (ALIASES[cleaned] ?? cleaned).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length > 1 && DIRECTIONS.has(tokens[0])) tokens.shift();

  const suffix = tokens.length > 1 ? SUFFIX_BY_SPELLING.get(tokens[tokens.length - 1]) : undefined;
  if (suffix) tokens.pop();
  return { base: tokens.join(" "), suffix: suffix ?? null };
}
