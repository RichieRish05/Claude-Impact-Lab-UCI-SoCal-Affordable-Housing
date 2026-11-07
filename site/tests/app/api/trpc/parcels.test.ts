import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createCallerFactory } from "@/app/api/trpc/init";
import { buildParcelWhere, PARCEL_RESULT_COLUMNS, searchSummary } from "@/app/api/trpc/parcels";
import { appRouter } from "@/app/api/trpc/router";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_PAGE_SIZE } from "@/lib/parcel-filters";

const caller = createCallerFactory(appRouter)({});
const user = { id: "user_1", email: "a@example.com", name: "Ada" };
const queryRaw = vi.mocked(db.$queryRaw);

function sqlText(sql: Prisma.Sql) {
  return sql.sql.replace(/\s+/g, " ").trim();
}

// search runs a page query and a totals query; answer each by its SQL.
function mockSearch(parcels: object[], total: number, totalHomes = 0) {
  queryRaw.mockImplementation(((strings: TemplateStringsArray) =>
    Promise.resolve(
      strings.join("").includes("count(*)")
        ? [{ total, total_homes: totalHomes }]
        : parcels,
    )) as unknown as typeof queryRaw);
}

describe("buildParcelWhere", () => {
  it("is empty with no filters", () => {
    expect(sqlText(buildParcelWhere({ sort: "homes" }))).toBe("");
  });

  it("parameterizes every value", () => {
    const where = buildParcelWhere({
      sort: "homes",
      eligible: true,
      vacant: true,
      minVacantConfidence: 0.8,
      zones: ["RL", "RM"],
      minHomes: 4,
      maxValue: 1_000_000,
      neighborhoods: ["Oak View"],
    });
    expect(sqlText(where)).toBe(
      "WHERE sb684_eligible AND vacant AND vacant_confidence >= ? AND zone IN (?,?) AND max_homes >= ? AND assessed_value <= ? AND neighborhood IN (?)",
    );
    expect(where.values).toEqual([0.8, "RL", "RM", 4, 1_000_000, "Oak View"]);
  });

  it("ignores the confidence threshold unless vacant is on", () => {
    expect(sqlText(buildParcelWhere({ sort: "homes", minVacantConfidence: 0.9 }))).toBe("");
  });

  it("keeps minimal-risk and unmapped lots when excluding flood zones", () => {
    expect(sqlText(buildParcelWhere({ sort: "homes", excludeFlood: true }))).toBe(
      "WHERE (flood_zone IS NULL OR flood_zone NOT SIMILAR TO '(A|V)%')",
    );
  });
});

describe("buildParcelWhere near a street", () => {
  it("keeps lots within the default half mile of the street's lots", () => {
    const where = buildParcelWhere({ sort: "homes", nearStreet: "Beach Blvd" });
    expect(sqlText(where)).toContain("ST_Intersects(geom");
    expect(where.values).toEqual(expect.arrayContaining(["beach", "blvd", 2640]));
  });

  it("uses the radius it is given", () => {
    const where = buildParcelWhere({ sort: "homes", nearStreet: "Beach Blvd", nearMi: 1 });
    expect(where.values).toContain(5280);
  });

  it("matches any suffix when none is typed", () => {
    const where = buildParcelWhere({ sort: "homes", nearStreet: "Beach" });
    expect(where.values).toContain("beach");
    expect(where.values).not.toContain("blvd");
    expect(where.values).toContain(null);
  });
});

describe("searchSummary", () => {
  it("returns totals and the top lots without building geometry", async () => {
    queryRaw.mockClear();
    mockSearch([{ apn: "FAKE-001", max_homes: 10 }], 1, 10);
    const result = await searchSummary({ sort: "homes", eligible: true }, 10);
    expect(result).toEqual({ total: 1, totalHomes: 10, parcels: [{ apn: "FAKE-001", max_homes: 10 }] });
    const pageSql = queryRaw.mock.calls
      .map(([strings]) => (strings as unknown as string[]).join(""))
      .find((text) => !text.includes("count(*)"));
    expect(pageSql).toBeDefined();
    expect(pageSql).not.toContain("ST_AsGeoJSON");
  });
});

describe("parcels.search", () => {
  it("rejects signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(caller.parcels.search({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns totals across all matches, the parcels and the filters it applied", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    mockSearch(
      [
        { apn: "FAKE-001", max_homes: 10 },
        { apn: "FAKE-003", max_homes: 7 },
      ],
      2,
      17,
    );

    const result = await caller.parcels.search({ eligible: true });

    expect(result).toEqual({
      filters: { eligible: true, sort: "homes" },
      total: 2,
      totalHomes: 17,
      parcels: [
        { apn: "FAKE-001", max_homes: 10 },
        { apn: "FAKE-003", max_homes: 7 },
      ],
      nextCursor: null,
    });
  });

  it("returns the next page's offset while matches remain", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const page = Array.from({ length: SEARCH_PAGE_SIZE }, (_, i) => ({ apn: `FAKE-${i}` }));
    mockSearch(page, SEARCH_PAGE_SIZE * 2 + 50);

    const first = await caller.parcels.search({ cursor: 0 });
    expect(first.nextCursor).toBe(SEARCH_PAGE_SIZE);

    const second = await caller.parcels.search({ cursor: SEARCH_PAGE_SIZE });
    expect(second.nextCursor).toBe(SEARCH_PAGE_SIZE * 2);
    expect(second.filters).toEqual({ sort: "homes" });
  });

  it("returns each lot's zone code citation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    queryRaw.mockClear();
    mockSearch([{ apn: "FAKE-001", source_section: "HBZSO §210.06" }], 1);
    const result = await caller.parcels.search({});
    expect(result.parcels[0].source_section).toBe("HBZSO §210.06");
    const pageSql = queryRaw.mock.calls
      .map(([strings]) => (strings as unknown as string[]).join(""))
      .find((text) => text.includes("JOIN page"));
    expect(pageSql).toContain("zone_rules");
    expect(sqlText(PARCEL_RESULT_COLUMNS)).toContain("source_section");
  });

  it("ends paging on the last page", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    mockSearch([{ apn: "FAKE-450" }], SEARCH_PAGE_SIZE + 1);
    const result = await caller.parcels.search({ cursor: SEARCH_PAGE_SIZE });
    expect(result.nextCursor).toBeNull();
  });

  it("rejects a negative cursor", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await expect(caller.parcels.search({ cursor: -1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("returns zero totals when nothing matches", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    mockSearch([], 0);
    const result = await caller.parcels.search({ minHomes: 10 });
    expect(result).toMatchObject({ total: 0, totalHomes: 0, parcels: [] });
  });

  it("rejects out-of-range input", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await expect(caller.parcels.search({ minHomes: 11 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("parcels.filterOptions", () => {
  it("rejects signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(caller.parcels.filterOptions()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns the zone and neighborhood lists from one query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    queryRaw.mockResolvedValue([{ zones: ["RL", "RM"], neighborhoods: ["Downtown"] }]);

    expect(await caller.parcels.filterOptions()).toEqual({
      zones: ["RL", "RM"],
      neighborhoods: ["Downtown"],
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("me", () => {
  it("returns only id and email", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    expect(await caller.me()).toEqual({ id: "user_1", email: "a@example.com" });
  });

  it("rejects signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
