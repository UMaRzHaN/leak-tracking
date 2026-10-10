import { describe, expect, it } from "vitest";
import { normalizeNumber } from "./normalizeNumber";

describe("normalizeNumber", () => {
  it("normalizes decimal separators and preserves valid zero", () => {
    expect(normalizeNumber("12,5")).toBe(12.5);
    expect(normalizeNumber(0)).toBe(0);
  });

  it("treats the last of mixed separators as decimal and the other as thousands", () => {
    expect(normalizeNumber("1,234.5")).toBe(1234.5);
    expect(normalizeNumber("1.234,56")).toBe(1234.56);
    expect(normalizeNumber("1,234,567.89")).toBe(1234567.89);
    expect(normalizeNumber("1.234.567,8")).toBe(1234567.8);
  });

  it("reads repeated three-digit groups as thousands", () => {
    expect(normalizeNumber("1.234.567")).toBe(1234567);
    expect(normalizeNumber("1,234,567")).toBe(1234567);
  });

  it("keeps a single separator decimal, as before", () => {
    expect(normalizeNumber("1,234")).toBe(1.234);
    expect(normalizeNumber("1.234")).toBe(1.234);
    expect(normalizeNumber("1.2.3")).toBe(1.23);
  });

  it("drops plain and non-breaking spaces between thousands", () => {
    expect(normalizeNumber("1 234,5")).toBe(1234.5);
    expect(normalizeNumber("1 234 567")).toBe(1234567);
    expect(normalizeNumber("12 345,6")).toBe(12345.6);
  });

  it("keeps the sign of a Unicode minus", () => {
    expect(normalizeNumber("−5")).toBe(-5);
    expect(normalizeNumber("−1 234,5")).toBe(-1234.5);
    expect(normalizeNumber("-2,5")).toBe(-2.5);
  });

  it("does not turn blank, partial, or invalid text into zero", () => {
    expect(normalizeNumber("   ")).toBe("");
    expect(normalizeNumber("abc")).toBe("");
    expect(normalizeNumber("-")).toBe("");
  });
});
