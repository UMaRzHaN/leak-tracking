import { describe, expect, it } from "vitest";
import { normalizeProjectVarsUnits } from "./projectVars";

describe("normalizeProjectVarsUnits", () => {
  it("converts legacy kg/L density and fractional uncertainty", () => {
    expect(
      normalizeProjectVarsUnits({
        gasType: "methane",
        density: 0.000716,
        uncertainty: 0.05,
      }),
    ).toEqual({ gasType: "methane", density: 0.7168, uncertainty: 5 });
  });

  it("keeps current kg/m³ and percent values unchanged", () => {
    const vars = { density: 0.7168, uncertainty: 5 };
    expect(normalizeProjectVarsUnits(vars)).toBe(vars);
  });
});
