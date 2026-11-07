import { describe, expect, it } from "vitest";
import { formatCount, formatDollars, formatSqft } from "@/lib/format";

describe("format", () => {
  it("pluralizes counts", () => {
    expect(formatCount(1, "lot")).toBe("1 lot");
    expect(formatCount(1420, "possible home")).toBe("1,420 possible homes");
  });

  it("abbreviates dollars", () => {
    expect(formatDollars(640000)).toBe("$640K");
    expect(formatDollars(1350000)).toBe("$1.35M");
    expect(formatDollars(2_000_000)).toBe("$2M");
    expect(formatDollars(null)).toBe("—");
  });

  it("formats square feet", () => {
    expect(formatSqft(21600)).toBe("21,600 sq ft");
  });
});
