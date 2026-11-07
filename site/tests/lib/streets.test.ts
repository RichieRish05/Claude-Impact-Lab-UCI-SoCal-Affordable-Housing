import { describe, expect, it } from "vitest";
import { normalizeStreet } from "@/lib/streets";

describe("normalizeStreet", () => {
  it.each([
    ["Beach Blvd", { base: "beach", suffix: "blvd" }],
    ["BEACH BOULEVARD", { base: "beach", suffix: "blvd" }],
    ["S Pacific Ave", { base: "pacific", suffix: "ave" }],
    ["Pacific Avenue", { base: "pacific", suffix: "ave" }],
    ["Beach", { base: "beach", suffix: null }],
    ["Main Street", { base: "main", suffix: "st" }],
    ["Golden West Dr", { base: "golden west", suffix: "dr" }],
    ["Oak Lane", { base: "oak", suffix: "ln" }],
    ["N", { base: "n", suffix: null }],
    ["Main St.", { base: "main", suffix: "st" }],
    ["Beach Blvd.,", { base: "beach", suffix: "blvd" }],
    ["PCH", { base: "pacific coast", suffix: "hwy" }],
    ["pch", { base: "pacific coast", suffix: "hwy" }],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeStreet(input)).toEqual(expected);
  });

  it("returns null for a blank name", () => {
    expect(normalizeStreet("   ")).toBeNull();
  });
});
