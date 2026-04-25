import { calculations } from "../../../utils/calculations/calculations";

const BASE_VARS = {
  density: 0.668,
  GWP: 28,
  percentage_gas_to_flare: 50,
  percentage_gas_to_utilization: 50,
  equipmentType: "valve",
  serial_number: "SN-001",
  uncertainty: 0.1,
};

describe("calculations", () => {
  it("returns leak unchanged when vars is null", () => {
    const leak = { leak_speed: 5 };
    expect(calculations(leak, null)).toEqual(leak);
  });

  it("returns null when leak is null", () => {
    expect(calculations(null, BASE_VARS)).toBeNull();
  });

  it("computes mass flow rate (leak_speed × density)", () => {
    const result = calculations({ leak_speed: 10 }, BASE_VARS);
    expect(result.leak_speed_kg_h).toBeCloseTo(10 * 0.668);
  });

  it("computes annual methane loss in m³/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_m3_y).toBe(8760);
  });

  it("computes annual methane loss in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_kg_y).toBeCloseTo(8760 * 0.7168);
  });

  it("computes annual methane loss in t/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_t_y).toBeCloseTo(8760 * 0.7168 * 0.001);
  });

  it("computes CO₂-equivalent emissions in t/year with mixed shares", () => {
    // weightedGWP = 0.5×28 + 0.5×(28×0.9) = 14 + 12.6 = 26.6
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    const t_y = 8760 * 0.7168 * 0.001;
    expect(result.Emissions_t_CO2eq_year).toBeCloseTo(t_y * 26.6);
  });

  it("computes CO₂-equivalent emissions in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Emissions_kg_CO2_eq_year).toBeCloseTo(result.Emissions_t_CO2eq_year * 1000);
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

  it("100% flare share → weightedGWP equals GWP", () => {
    const vars = { ...BASE_VARS, percentage_gas_to_flare: 100, percentage_gas_to_utilization: 0 };
    const result = calculations({ leak_speed: 1 }, vars);
    const t_y = 8760 * 0.7168 * 0.001;
    expect(result.Emissions_t_CO2eq_year).toBeCloseTo(t_y * 28);
  });

  it("100% utilization share → weightedGWP equals GWP × 0.9", () => {
    const vars = { ...BASE_VARS, percentage_gas_to_flare: 0, percentage_gas_to_utilization: 100 };
    const result = calculations({ leak_speed: 1 }, vars);
    const t_y = 8760 * 0.7168 * 0.001;
    expect(result.Emissions_t_CO2eq_year).toBeCloseTo(t_y * 28 * 0.9);
  });

  it("preserves extra leak fields in output", () => {
    const result = calculations({ leak_speed: 1, id: "abc", status: "open" }, BASE_VARS);
    expect(result.id).toBe("abc");
    expect(result.status).toBe("open");
  });

  it("passes through equipmentType, serial_number, GWP, uncertainty", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.equipmentType).toBe("valve");
    expect(result.serial_number).toBe("SN-001");
    expect(result.GWP).toBe(28);
    expect(result.uncertainty).toBe(0.1);
  });

  it("flareShare and utilShare are fractions (0–1)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.flareShare).toBeCloseTo(0.5);
    expect(result.utilShare).toBeCloseTo(0.5);
  });
});
