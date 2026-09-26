import { describe, expect, it } from "vitest";
import {
  NotFoundError,
  UnauthorizedError,
  toErrorResponse,
} from "@/lib/auth/errors";

describe("toErrorResponse", () => {
  it("maps UnauthorizedError to a 401 JSON response", async () => {
    const res = toErrorResponse(new UnauthorizedError());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("maps NotFoundError to a 404 JSON response", async () => {
    const res = toErrorResponse(new NotFoundError());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("rethrows any other Error unchanged", () => {
    const boom = new Error("boom");
    expect(() => toErrorResponse(boom)).toThrow(boom);
  });

  it("rethrows a non-Error thrown value unchanged", () => {
    let caught: unknown;
    try {
      toErrorResponse("boom");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe("boom");
  });
});
