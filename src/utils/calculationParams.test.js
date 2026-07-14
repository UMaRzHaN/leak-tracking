import { describe, expect, it } from "vitest";
import { VAR_DEFAULTS } from "@/data/variables";
import {
  buildLeakCalculationParams,
  calculateLeakWithSnapshot,
} from "./calculationParams";

describe("calculationParams", () => {
  it("prefers a per-leak snapshot over current project variables", () => {
    const params = buildLeakCalculationParams(
      {
        equipmentType: "GFM 2.0",
        calculationParams: {
          equipmentType: "GFM 3.0",
          gasPercentage: 82,
          percentage_gas_to_flare: 25,
        },
      },
      {
        ...VAR_DEFAULTS,
        equipmentType: "GFM 2.0",
        gasPercentage: 100,
      },
    );

    expect(params.equipmentType).toBe("GFM 3.0");
    expect(params.gasPercentage).toBe(82);
    expect(params.percentage_gas_to_utilization).toBe(75);
  });

  it("stores the complete calculation input on a calculated leak", () => {
    const result = calculateLeakWithSnapshot(
      { leak_speed: 10, pressure: 1, temperature: 20 },
      VAR_DEFAULTS,
    );

    expect(result.calculationVersion).toBe(1);
    expect(result.calculationParams).toMatchObject(VAR_DEFAULTS);
    expect(result.Total_Annual_Methane_Loss_m3_y).toBeTypeOf("number");
  });

  it("keeps an existing snapshot when recalculating after project defaults change", () => {
    const leak = calculateLeakWithSnapshot(
      { leak_speed: 10, pressure: 1, temperature: 20 },
      { ...VAR_DEFAULTS, gasPercentage: 70 },
    );
    const recalculated = calculateLeakWithSnapshot(leak, {
      ...VAR_DEFAULTS,
      gasPercentage: 100,
    });

    expect(recalculated.calculationParams.gasPercentage).toBe(70);
  });
});
