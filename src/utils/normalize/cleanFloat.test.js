import { describe, expect, it } from "vitest";
import { cleanFloat } from "./cleanFloat";

describe("cleanFloat", () => {
  it("срезает хвост погрешности", () => {
    expect(cleanFloat(319.95 - 273.15)).toBe(46.8);
    expect(cleanFloat(0.1 + 0.2)).toBe(0.3);
  });

  it("не трогает настоящие значения и не числа", () => {
    expect(cleanFloat(41.311081234567)).toBe(41.311081234567);
    expect(cleanFloat(-0.000123)).toBe(-0.000123);
    expect(cleanFloat(1e21)).toBe(1e21);
    expect(cleanFloat("46.80000000000001")).toBe("46.80000000000001");
    expect(cleanFloat(Number.NaN)).toBeNaN();
    expect(cleanFloat(null)).toBeNull();
  });
});
