import { describe, expect, it } from "vitest";
import { normalizeNumber } from "./normalizeNumber";

describe("normalizeNumber", () => {
  it("normalizes decimal separators and preserves valid zero", () => {
    expect(normalizeNumber("12,5")).toBe(12.5);
    expect(normalizeNumber(0)).toBe(0);
  });

  it("does not turn blank, partial, or invalid text into zero", () => {
    expect(normalizeNumber("   ")).toBe("");
    expect(normalizeNumber("abc")).toBe("");
    expect(normalizeNumber("-")).toBe("");
  });
});
