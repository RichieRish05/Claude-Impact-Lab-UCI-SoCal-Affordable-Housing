import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  NEAR_DEFAULT_MI,
  parcelSearchInputSchema,
  SEARCH_PAGE_SIZE,
  type ParcelFilters,
  type ParcelSort,
} from "@/lib/parcel-filters";
import { normalizeStreet, SUFFIXES } from "@/lib/streets";
import { protectedProcedure, router } from "./init";

export type ParcelResult = {
  apn: string;
  address: string | null;
  zone: string | null;
  lot_sqft: number | null;
  vacant: boolean | null;
  vacant_confidence: number | null;
  sb684_eligible: boolean | null;
  max_homes: number | null;
  eligibility_reason: string | null;
  assessed_value: number | null;
  dist_transit_ft: number | null;
  flood_zone: string | null;
  neighborhood: string | null;
  source_section: string | null;
  geometry: GeoJSON.MultiPolygon;
  lng: number;
  lat: number;
};

const FEET_PER_MILE = 5280;

const ALL_SPELLINGS = Object.values(SUFFIXES).flat().join("|");

// The same normalization as normalizeStreet, applied to the street part of
// "424 19th St, Huntington Beach, CA": drop the house number, unit or space
// numbers, and a leading direction letter. Built only from constants.
const STREET = Prisma.raw(`regexp_replace(regexp_replace(regexp_replace(
    lower(trim(split_part(address, ',', 1))),
    '^\\S+\\s+', ''),
    '\\s+(spc|unit|apt|ste)(\\s.*)?$|\\s*#.*$', ''),
    '^[nsew]\\s+(?=\\S)', '')`);
const STREET_BASE = Prisma.raw(
  `regexp_replace(${STREET.sql}, '\\s+(${ALL_SPELLINGS})$', '')`,
);
const STREET_SUFFIX = Prisma.raw(
  `CASE substring(${STREET.sql} from '\\s(${ALL_SPELLINGS})$') ${Object.entries(SUFFIXES)
    .flatMap(([canonical, spellings]) => spellings.map((s) => `WHEN '${s}' THEN '${canonical}'`))
    .join(" ")} END`,
);

export function streetMatchSql(street: string): Prisma.Sql {
  const name = normalizeStreet(street);
  if (!name) return Prisma.sql`false`;
  return Prisma.sql`(${STREET_BASE} = ${name.base} AND (${name.suffix}::text IS NULL OR ${STREET_SUFFIX} = ${name.suffix}))`;
}

export async function countStreetLots(street: string): Promise<number> {
  const [row] = await db.$queryRaw<[{ count: number }]>`
    SELECT count(*)::int AS count FROM parcels WHERE ${streetMatchSql(street)}
  `;
  return row.count;
}

export function buildParcelWhere(filters: ParcelFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filters.eligible) conditions.push(Prisma.sql`sb684_eligible`);
  if (filters.vacant) {
    conditions.push(Prisma.sql`vacant`);
    if (filters.minVacantConfidence !== undefined) {
      conditions.push(
        Prisma.sql`vacant_confidence >= ${filters.minVacantConfidence}`,
      );
    }
  }
  if (filters.zones?.length) {
    conditions.push(Prisma.sql`zone IN (${Prisma.join(filters.zones)})`);
  }
  if (filters.minLotSqft !== undefined) {
    conditions.push(Prisma.sql`lot_sqft >= ${filters.minLotSqft}`);
  }
  if (filters.maxLotSqft !== undefined) {
    conditions.push(Prisma.sql`lot_sqft <= ${filters.maxLotSqft}`);
  }
  if (filters.minHomes !== undefined) {
    conditions.push(Prisma.sql`max_homes >= ${filters.minHomes}`);
  }
  if (filters.maxValue !== undefined) {
    conditions.push(Prisma.sql`assessed_value <= ${filters.maxValue}`);
  }
  if (filters.maxTransitFt !== undefined) {
    conditions.push(Prisma.sql`dist_transit_ft <= ${filters.maxTransitFt}`);
  }
  if (filters.excludeFlood) {
    // FEMA's special flood hazard areas are the A and V zones; X is minimal risk.
    conditions.push(
      Prisma.sql`(flood_zone IS NULL OR flood_zone NOT SIMILAR TO '(A|V)%')`,
    );
  }
  if (filters.neighborhoods?.length) {
    conditions.push(
      Prisma.sql`neighborhood IN (${Prisma.join(filters.neighborhoods)})`,
    );
  }

  if (filters.nearStreet) {
    const feet = (filters.nearMi ?? NEAR_DEFAULT_MI) * FEET_PER_MILE;
    // Buffering the street once in California State Plane VI (US feet), then
    // intersecting, uses the geom index; ST_DWithin on geography against the
    // union scanned every lot and took seconds.
    conditions.push(Prisma.sql`ST_Intersects(geom, (
      SELECT ST_Transform(ST_Buffer(ST_Transform(ST_Union(geom), 2230), ${feet}), 4326)
      FROM parcels WHERE ${streetMatchSql(filters.nearStreet)}))`);
  }

  return conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

const ORDER_BY: Record<ParcelSort, Prisma.Sql> = {
  homes: Prisma.sql`max_homes DESC NULLS LAST, lot_sqft DESC NULLS LAST, apn`,
  lot: Prisma.sql`lot_sqft DESC NULLS LAST, apn`,
  value: Prisma.sql`assessed_value ASC NULLS LAST, apn`,
  transit: Prisma.sql`dist_transit_ft ASC NULLS LAST, apn`,
};

async function searchTotals(where: Prisma.Sql) {
  const [totals] = await db.$queryRaw<[{ total: number; total_homes: number }]>`
    SELECT count(*)::int AS total,
           coalesce(sum(max_homes), 0)::int AS total_homes
    FROM parcels
    ${where}
  `;
  return { total: totals.total, totalHomes: totals.total_homes };
}

export type ParcelSummary = Pick<
  ParcelResult,
  "apn" | "address" | "zone" | "lot_sqft" | "max_homes" | "assessed_value"
>;

export async function searchSummary(filters: ParcelFilters, limit: number) {
  const where = buildParcelWhere(filters);
  const [totals, parcels] = await Promise.all([
    searchTotals(where),
    db.$queryRaw<ParcelSummary[]>`
      SELECT apn, address, zone, lot_sqft, max_homes, assessed_value
      FROM parcels
      ${where}
      ORDER BY ${ORDER_BY[filters.sort]}
      LIMIT ${limit}
    `,
  ]);
  return { ...totals, parcels };
}

export const parcelsRouter = router({
  search: protectedProcedure
    .input(parcelSearchInputSchema)
    .query(async ({ input }) => {
      const { cursor, ...filters } = input;
      const where = buildParcelWhere(filters);
      const orderBy = ORDER_BY[filters.sort];

      // The page is picked from narrow columns first, so geometry is built
      // only for its rows. Otherwise Postgres builds it for every row the
      // OFFSET skips.
      const [parcels, totals] = await Promise.all([
        db.$queryRaw<ParcelResult[]>`
          WITH page AS (
            SELECT apn FROM parcels
            ${where}
            ORDER BY ${orderBy}
            LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${cursor}
          )
          SELECT apn, address, zone, lot_sqft, vacant, vacant_confidence,
                 sb684_eligible, max_homes, eligibility_reason, assessed_value,
                 dist_transit_ft, flood_zone, neighborhood, source_section,
                 ST_AsGeoJSON(geom)::json AS geometry,
                 ST_X(ST_PointOnSurface(geom)) AS lng,
                 ST_Y(ST_PointOnSurface(geom)) AS lat
          FROM parcels JOIN page USING (apn)
          LEFT JOIN zone_rules USING (zone)
          ORDER BY ${orderBy}
        `,
        searchTotals(where),
      ]);

      const next = cursor + parcels.length;
      return {
        filters,
        ...totals,
        parcels,
        nextCursor: parcels.length > 0 && next < totals.total ? next : null,
      };
    }),

  // Raw SQL because Prisma's `distinct` dedupes in Node after fetching every
  // row; this reads the table once and returns only the short lists.
  filterOptions: protectedProcedure.query(async () => {
    const [options] = await db.$queryRaw<
      [{ zones: string[]; neighborhoods: string[] }]
    >`
      SELECT
        coalesce(array_agg(DISTINCT zone ORDER BY zone)
          FILTER (WHERE zone IS NOT NULL), '{}') AS zones,
        coalesce(array_agg(DISTINCT neighborhood ORDER BY neighborhood)
          FILTER (WHERE neighborhood IS NOT NULL), '{}') AS neighborhoods
      FROM parcels
    `;
    return options;
  }),
});
