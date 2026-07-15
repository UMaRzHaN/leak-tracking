import { describe, expect, it } from "vitest";
import { VAR_DEFAULTS } from "@/data/variables";
import {
  buildLeakCalculationParams,
  calculateLeakWithSnapshot,
  updateLeakCalculationParams,
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

  it("updates a leak with shared parameters and records the bulk recalculation", () => {
    const leak = calculateLeakWithSnapshot(
      {
        id: "leak-1",
        leak_speed: 10,
        pressure: 1,
        temperature: 20,
        history: [],
      },
      VAR_DEFAULTS,
    );
    const nextParams = {
      ...leak.calculationParams,
      gasPercentage: 75,
      percentage_gas_to_flare: 20,
      percentage_gas_to_utilization: 80,
    };

    const updated = updateLeakCalculationParams(
      leak,
      VAR_DEFAULTS,
      nextParams,
      { user: "Inspector", now: 1_784_104_200_000 },
    );

    expect(updated.calculationParams).toMatchObject(nextParams);
    expect(updated.updatedAt).toBe(1_784_104_200_000);
    expect(updated.history.at(-1)).toMatchObject({
      action: "edited",
      user: "Inspector",
    });
    expect(updated.history.at(-1).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "gasPercentage", to: 75 }),
        expect.objectContaining({ key: "percentage_gas_to_flare", to: 20 }),
      ]),
    );
  });
});
