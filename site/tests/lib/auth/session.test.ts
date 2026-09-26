import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: vi.fn() },
}));

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";

const getSession = vi.mocked(auth.getSession);

const sdkUser = {
  id: "user_1",
  email: "a@example.com",
  name: "Ada",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("getCurrentUser", () => {
  it("maps a valid session to exactly { id, email, name }", async () => {
    getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: sdkUser },
      error: null,
    } as never);
    expect(await getCurrentUser()).toEqual({
      id: "user_1",
      email: "a@example.com",
      name: "Ada",
    });
  });

  it("returns null when data is null", async () => {
    getSession.mockResolvedValue({ data: null, error: null } as never);
    expect(await getCurrentUser()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns null when the session has no user", async () => {
    getSession.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    } as never);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null and logs when the SDK returns an error", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: { message: "upstream down", status: 503, statusText: "", code: "INTERNAL_ERROR" },
    } as never);
    expect(await getCurrentUser()).toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("returns null when the SDK returns an error alongside a user", async () => {
    getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: sdkUser },
      error: { message: "weird", status: 500, statusText: "", code: "INTERNAL_ERROR" },
    } as never);
    expect(await getCurrentUser()).toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("returns null and logs when getSession throws", async () => {
    getSession.mockRejectedValue(new Error("network"));
    expect(await getCurrentUser()).toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("rethrows Next.js control-flow errors instead of treating them as signed out", async () => {
    getSession.mockImplementation(() => redirect("/elsewhere"));
    await expect(getCurrentUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
