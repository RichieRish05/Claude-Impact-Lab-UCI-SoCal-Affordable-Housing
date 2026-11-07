import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: { middleware: vi.fn(() => vi.fn()) },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { auth } from "@/lib/auth/server";
import { config } from "@/proxy";

// Captured at import time: clearMocks wipes call history before each test.
const middlewareCalls = vi.mocked(auth.middleware).mock.calls.slice();

const matches = (url: string) =>
  unstable_doesMiddlewareMatch({ config, url });

describe("proxy", () => {
  it("uses the Neon Auth middleware with /auth/sign-in as the login URL", () => {
    expect(middlewareCalls).toEqual([[{ loginUrl: "/auth/sign-in" }]]);
  });

  it.each(["/dashboard", "/dashboard/settings", "/dashboard?tab=exports"])(
    "runs on protected path %s",
    (url) => {
      expect(matches(url)).toBe(true);
    },
  );

  it.each([
    "/",
    "/dashboard-old",
    "/auth/sign-in",
    "/auth/sign-up",
    "/api/auth/get-session",
    "/api/auth/callback/google",
    "/api/inngest",
    "/api/trpc/parcels.search",
    "/_next/static/chunk.js",
    "/favicon.ico",
  ])("does not run on %s", (url) => {
    expect(matches(url)).toBe(false);
  });
});
