import { afterEach, describe, expect, it, vi } from "vitest";

const DB_URL = "postgresql://user:pass@ep-example-pooler.neon.test/neondb";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (globalThis as { prisma?: unknown }).prisma;
});

describe("lib/db", () => {
  it("creates a Prisma client without connecting", async () => {
    vi.stubEnv("DATABASE_URL", DB_URL);
    const { db } = await import("@/lib/db");
    expect(typeof db.$queryRaw).toBe("function");
  });

  it("fails fast naming DATABASE_URL when it is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/lib/db")).rejects.toThrow("DATABASE_URL");
  });

  it("reuses one client when the module reloads, as in dev hot reload", async () => {
    vi.stubEnv("DATABASE_URL", DB_URL);
    const first = (await import("@/lib/db")).db;
    vi.resetModules();
    const second = (await import("@/lib/db")).db;
    expect(second).toBe(first);
  });

  it("does not keep the client on globalThis in production", async () => {
    vi.stubEnv("DATABASE_URL", DB_URL);
    vi.stubEnv("NODE_ENV", "production");
    await import("@/lib/db");
    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined();
  });
});
