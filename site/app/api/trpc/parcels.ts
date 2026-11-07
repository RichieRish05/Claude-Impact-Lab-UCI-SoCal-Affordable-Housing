import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  parcelFiltersSchema,
  SEARCH_RESULT_LIMIT,
  type ParcelFilters,
  type ParcelSort,
} from "@/lib/parcel-filters";
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
  geometry: GeoJSON.MultiPolygon;
  lng: number;
  lat: number;
};

type SearchRow = ParcelResult & { total: number; total_homes: number };

function withoutTotals(row: SearchRow): ParcelResult {
  const parcel: Partial<SearchRow> = { ...row };
  delete parcel.total;
  delete parcel.total_homes;
  return parcel as ParcelResult;
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

  return conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

const ORDER_BY: Record<ParcelSort, Prisma.Sql> = {
  homes: Prisma.sql`max_homes DESC NULLS LAST, lot_sqft DESC NULLS LAST`,
  lot: Prisma.sql`lot_sqft DESC NULLS LAST`,
  value: Prisma.sql`assessed_value ASC NULLS LAST`,
  transit: Prisma.sql`dist_transit_ft ASC NULLS LAST`,
};

export const parcelsRouter = router({
  search: protectedProcedure
    .input(parcelFiltersSchema)
    .query(async ({ input }) => {
      // Window totals run before LIMIT, so the count covers every match.
      const rows = await db.$queryRaw<SearchRow[]>`
        SELECT apn, address, zone, lot_sqft, vacant, vacant_confidence,
               sb684_eligible, max_homes, eligibility_reason, assessed_value,
               dist_transit_ft, flood_zone, neighborhood,
               ST_AsGeoJSON(geom)::json AS geometry,
               ST_X(ST_PointOnSurface(geom)) AS lng,
               ST_Y(ST_PointOnSurface(geom)) AS lat,
               (count(*) OVER ())::int AS total,
               (coalesce(sum(max_homes) OVER (), 0))::int AS total_homes
        FROM parcels
        ${buildParcelWhere(input)}
        ORDER BY ${ORDER_BY[input.sort]}, apn
        LIMIT ${SEARCH_RESULT_LIMIT}
      `;

      return {
        filters: input,
        total: rows[0]?.total ?? 0,
        totalHomes: rows[0]?.total_homes ?? 0,
        parcels: rows.map(withoutTotals),
      };
    }),

  filterOptions: protectedProcedure.query(async () => {
    const [zones, neighborhoods] = await Promise.all([
      db.parcel.findMany({
        where: { zone: { not: null } },
        distinct: ["zone"],
        select: { zone: true },
        orderBy: { zone: "asc" },
      }),
      db.parcel.findMany({
        where: { neighborhood: { not: null } },
        distinct: ["neighborhood"],
        select: { neighborhood: true },
        orderBy: { neighborhood: "asc" },
      }),
    ]);
    return {
      zones: zones.flatMap((r) => (r.zone ? [r.zone] : [])),
      neighborhoods: neighborhoods.flatMap((r) =>
        r.neighborhood ? [r.neighborhood] : [],
      ),
    };
  }),
});
