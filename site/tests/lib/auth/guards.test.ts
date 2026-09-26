import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/auth/errors";
import { requirePageUser, requireUser } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

const user = { id: "user_1", email: "a@example.com", name: "Ada" };
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

describe("requireUser", () => {
  it("returns the signed-in user", async () => {
    mockedGetCurrentUser.mockResolvedValue(user);
    await expect(requireUser()).resolves.toEqual(user);
  });

  it("throws UnauthorizedError when nobody is signed in", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requirePageUser", () => {
  it("returns the signed-in user without redirecting", async () => {
    mockedGetCurrentUser.mockResolvedValue(user);
    await expect(requirePageUser()).resolves.toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /auth/sign-in when nobody is signed in", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(requirePageUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});
