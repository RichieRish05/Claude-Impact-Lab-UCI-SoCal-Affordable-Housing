import { describe, expect, it } from "vitest";
import { assertOwner } from "@/lib/auth/authorize";
import { NotFoundError } from "@/lib/auth/errors";

describe("assertOwner", () => {
  it("passes when the resource belongs to the user", () => {
    expect(() => assertOwner({ id: "u1" }, { userId: "u1" })).not.toThrow();
  });

  it("throws NotFoundError when the resource belongs to someone else", () => {
    expect(() => assertOwner({ id: "u1" }, { userId: "u2" })).toThrow(
      NotFoundError,
    );
  });
});
