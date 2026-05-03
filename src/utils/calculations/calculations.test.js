import { calculations } from "./calculations";

const BASE_VARS = {
  density: 0.668,
  GWP_CH4: 28,
  GWP_CH4_Minus: 25.25,
  percentage_gas_to_flare: 50,
  percentage_gas_to_utilization: 50,
  equipmentType: "valve",
  serial_number: "SN-001",
  uncertainty: 0.1,
};

// leak_speed (м³/ч) × MINUTES_PER_YEAR(525600) / 1000
const M3_Y = (speed) => (speed * 525600) / 1000;

describe("calculations", () => {
  it("returns leak unchanged when vars is null", () => {
    const leak = { leak_speed: 5 };
    expect(calculations(leak, null)).toEqual(leak);
  });

  it("returns null when leak is null", () => {
    expect(calculations(null, BASE_VARS)).toBeNull();
  });

  it("computes mass flow rate kg/min (leak_speed × density)", () => {
    const result = calculations({ leak_speed: 10 }, BASE_VARS);
    expect(result.leak_speed_kg_m).toBeCloseTo(10 * 0.668);
  });

  it("computes annual methane loss in m³/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(M3_Y(1));
  });

  it("computes annual methane loss in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_kg_y).toBeCloseTo(M3_Y(1) * 0.7168);
  });

  it("computes annual methane loss in t/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_t_y).toBeCloseTo(
      M3_Y(1) * 0.7168 * 0.001,
    );
  });

  it("computes CO₂-equivalent emissions in t/year using GWP_CH4 (not weighted)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    const t_y = M3_Y(1) * 0.7168 * 0.001;
    expect(result.Emissions_t_CO2eq_year).toBeCloseTo(t_y * 28);
  });

  it("computes CO₂-equivalent emissions in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Emissions_kg_CO2_eq_year).toBeCloseTo(
      result.Emissions_t_CO2eq_year * 1000,
    );
  });

  it("weightedGWP_CH4 is computed from shares (50/50)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    // 0.5×28 + 0.5×(28×0.9) = 14 + 12.6 = 26.6
    expect(result.weightedGWP_CH4).toBeCloseTo(26.6);
  });

  it("weightedGWP_CH4 with 100% flare equals GWP_CH4", () => {
    const vars = {
      ...BASE_VARS,
      percentage_gas_to_flare: 100,
      percentage_gas_to_utilization: 0,
    };
    const result = calculations({ leak_speed: 1 }, vars);
    expect(result.weightedGWP_CH4).toBeCloseTo(28);
  });

  it("weightedGWP_CH4 with 100% utilization equals GWP_CH4 × 0.9", () => {
    const vars = {
      ...BASE_VARS,
      percentage_gas_to_flare: 0,
      percentage_gas_to_utilization: 100,
    };
    const result = calculations({ leak_speed: 1 }, vars);
    expect(result.weightedGWP_CH4).toBeCloseTo(28 * 0.9);
  });

  it("emissions use GWP_CH4 regardless of flare/util shares", () => {
    const varsFlare = {
      ...BASE_VARS,
      percentage_gas_to_flare: 100,
      percentage_gas_to_utilization: 0,
    };
    const varsUtil = {
      ...BASE_VARS,
      percentage_gas_to_flare: 0,
      percentage_gas_to_utilization: 100,
    };
    const t_y = M3_Y(1) * 0.7168 * 0.001;
    expect(
      calculations({ leak_speed: 1 }, varsFlare).Emissions_t_CO2eq_year,
    ).toBeCloseTo(t_y * 28);
    expect(
      calculations({ leak_speed: 1 }, varsUtil).Emissions_t_CO2eq_year,
    ).toBeCloseTo(t_y * 28);
  });

  it("converts temperature to Kelvin", () => {
    const result = calculations({ leak_speed: 1, temperature: 20 }, BASE_VARS);
    expect(result.temperature_K).toBeCloseTo(293.15);
  });

  it("converts negative temperature to Kelvin", () => {
    const result = calculations({ leak_speed: 1, temperature: -40 }, BASE_VARS);
    expect(result.temperature_K).toBeCloseTo(233.15);
  });

  it("sets temperature_K to null when temperature is absent", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.temperature_K).toBeNull();
  });

  it("handles zero leak_speed (no emissions)", () => {
    const result = calculations({ leak_speed: 0 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_m3_y).toBe(0);
    expect(result.Emissions_t_CO2eq_year).toBe(0);
  });

  it("preserves extra leak fields in output", () => {
    const result = calculations(
      { leak_speed: 1, id: "abc", status: "open" },
      BASE_VARS,
    );
    expect(result.id).toBe("abc");
    expect(result.status).toBe("open");
  });

  it("passes through equipmentType, serial_number, GWP_CH4, uncertainty", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.equipmentType).toBe("valve");
    expect(result.serial_number).toBe("SN-001");
    expect(result.GWP_CH4).toBe(28);
    expect(result.uncertainty).toBe(0.1);
  });

  it("flareShare and utilShare are fractions (0–1)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.flareShare).toBeCloseTo(0.5);
    expect(result.utilShare).toBeCloseTo(0.5);
  });
});
