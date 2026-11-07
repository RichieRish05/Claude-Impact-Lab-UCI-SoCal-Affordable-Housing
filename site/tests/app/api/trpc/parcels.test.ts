import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createCallerFactory } from "@/app/api/trpc/init";
import { buildParcelWhere } from "@/app/api/trpc/parcels";
import { appRouter } from "@/app/api/trpc/router";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const caller = createCallerFactory(appRouter)({});
const user = { id: "user_1", email: "a@example.com", name: "Ada" };
const queryRaw = vi.mocked(db.$queryRaw);

function sqlText(sql: Prisma.Sql) {
  return sql.sql.replace(/\s+/g, " ").trim();
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

describe("parcels.search", () => {
  it("rejects signed-out callers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(caller.parcels.search({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns totals across all matches, the parcels and the filters it applied", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    queryRaw.mockResolvedValue([
      { apn: "FAKE-001", max_homes: 10, total: 2, total_homes: 17 },
      { apn: "FAKE-003", max_homes: 7, total: 2, total_homes: 17 },
    ]);

    const result = await caller.parcels.search({ eligible: true });

    expect(result).toEqual({
      filters: { eligible: true, sort: "homes" },
      total: 2,
      totalHomes: 17,
      parcels: [
        { apn: "FAKE-001", max_homes: 10 },
        { apn: "FAKE-003", max_homes: 7 },
      ],
    });
  });

  it("returns zero totals when nothing matches", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    queryRaw.mockResolvedValue([]);
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
