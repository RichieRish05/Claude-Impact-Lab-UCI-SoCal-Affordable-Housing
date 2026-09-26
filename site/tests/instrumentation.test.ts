import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("instrumentation register", () => {
  it("fails server boot when auth config is invalid", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(32));
    const { register } = await import("@/instrumentation");
    await expect(register()).rejects.toThrow("NEON_AUTH_BASE_URL");
  });

  it("boots when auth config is valid", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://ep-example.neonauth.test/neondb/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(32));
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
  });
});
