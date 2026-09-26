import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { GET } from "@/app/api/me/route";
import { getCurrentUser } from "@/lib/auth/session";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

describe("GET /api/me", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns only id and email for the signed-in user", async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: "Ada",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user_1", email: "a@example.com" });
  });
});
