import { describe, expect, it } from "vitest";
import { toNullableNumber } from "./toNullableNumber";

describe("toNullableNumber", () => {
  it("returns null for empty values", () => {
    expect(toNullableNumber("")).toBeNull();
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber(undefined)).toBeNull();
  });

  it("returns finite numbers unchanged", () => {
    expect(toNullableNumber(12.5)).toBe(12.5);
    expect(toNullableNumber("12.5")).toBe(12.5);
    expect(toNullableNumber("12,5")).toBe(12.5);
  });

  it("returns null for invalid values", () => {
    expect(toNullableNumber("abc")).toBeNull();
    expect(toNullableNumber(Number.NaN)).toBeNull();
    expect(toNullableNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
