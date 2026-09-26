import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_URL = "https://ep-example.neonauth.test/neondb/auth";
const GOOD_SECRET = "x".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lib/auth/server", () => {
  it("creates the auth instance when config is valid", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", BASE_URL);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", GOOD_SECRET);
    const { auth } = await import("@/lib/auth/server");
    expect(typeof auth.getSession).toBe("function");
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.middleware).toBe("function");
  });

  it("fails fast naming NEON_AUTH_BASE_URL when it is missing", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", GOOD_SECRET);
    await expect(import("@/lib/auth/server")).rejects.toThrow(
      "NEON_AUTH_BASE_URL",
    );
  });

  it("fails fast naming NEON_AUTH_COOKIE_SECRET when it is missing", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", BASE_URL);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    await expect(import("@/lib/auth/server")).rejects.toThrow(
      "NEON_AUTH_COOKIE_SECRET",
    );
  });

  it("fails fast when the cookie secret is shorter than 32 characters", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", BASE_URL);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "too-short");
    await expect(import("@/lib/auth/server")).rejects.toThrow(
      "at least 32 characters",
    );
  });
});
