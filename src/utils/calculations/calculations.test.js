import { calculations, isPinkBagEquipment } from "./calculations";

const BASE_VARS = {
  density: 0.7168, // кг/м³ (метан при стандартных условиях)
  GWP: 28,
  GWP_Minus: 25.25,
  percentage_gas_to_flare: 50,
  percentage_gas_to_utilization: 50,
  gasPercentage: 100,
  equipmentType: "GFM 2.0",
  serial_number: null,
  uncertainty: 0.1,
  Operating_mode: 365,
};

// uncertaintyFactor = (100 - uncertainty) / 100
const UF = (100 - BASE_VARS.uncertainty) / 100;

// Annual volume loss in m³/year: leak_speed (л/мин) × minutes × UF / 1000
const M3_Y = (speed, days = 365) => (speed * 1440 * days * UF) / 1000;

// leak_speed_standard for "Розовый мешок": normalised to STP (0°C, 0.101325 MPa)
const stdSpeed = (speed, pressure, tempC, gasPercentage) =>
  ((speed * pressure) / (tempC + 273.15)) *
  (273.15 / 0.101325) *
  (gasPercentage / 100);

describe("calculations", () => {
  it("returns leak unchanged when vars is null", () => {
    const leak = { leak_speed: 5 };
    expect(calculations(leak, null)).toEqual(leak);
  });

  it("returns null when leak is null", () => {
    expect(calculations(null, BASE_VARS)).toBeNull();
  });

  it("returns leak unchanged when Operating_mode is 0 or negative", () => {
    const leak = { leak_speed: 5 };
    expect(calculations(leak, { ...BASE_VARS, Operating_mode: 0 })).toEqual(
      leak,
    );
    expect(calculations(leak, { ...BASE_VARS, Operating_mode: -1 })).toEqual(
      leak,
    );
  });

  it("computes mass flow rate kg/min (leak_rate × density)", () => {
    const result = calculations({ leak_speed: 10 }, BASE_VARS);
    expect(result.leak_speed_kg_m).toBeCloseTo(10 * BASE_VARS.density);
  });

  it("computes annual methane loss in m³/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(M3_Y(1));
  });

  it("computes annual methane loss in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_kg_y).toBeCloseTo(
      M3_Y(1) * BASE_VARS.density,
    );
  });

  it("computes annual methane loss in t/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Total_Annual_Methane_Loss_t_y).toBeCloseTo(
      M3_Y(1) * BASE_VARS.density * 0.001,
    );
  });

  it("computes CO₂-equivalent emissions in t/year using weightedGWP", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    const t_y = M3_Y(1) * BASE_VARS.density * 0.001;
    // 0.5×GWP_Minus + 0.5×GWP = 0.5×25.25 + 0.5×28 = 26.625
    expect(result.Emissions_t_CO2eq_year).toBeCloseTo(t_y * 26.625);
  });

  it("computes CO₂-equivalent emissions in kg/year", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.Emissions_kg_CO2_eq_year).toBeCloseTo(
      result.Emissions_t_CO2eq_year * 1000,
    );
  });

  it("weightedGWP is computed from shares (50/50)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.weightedGWP).toBeCloseTo(26.625);
  });

  it("weightedGWP with 100% flare equals GWP_Minus", () => {
    const vars = {
      ...BASE_VARS,
      percentage_gas_to_flare: 100,
      percentage_gas_to_utilization: 0,
    };
    expect(calculations({ leak_speed: 1 }, vars).weightedGWP).toBeCloseTo(
      25.25,
    );
  });

  it("weightedGWP with 100% utilization equals GWP", () => {
    const vars = {
      ...BASE_VARS,
      percentage_gas_to_flare: 0,
      percentage_gas_to_utilization: 100,
    };
    expect(calculations({ leak_speed: 1 }, vars).weightedGWP).toBeCloseTo(28);
  });

  it("emissions depend on flare/util shares via weightedGWP", () => {
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
    const t_y = M3_Y(1) * BASE_VARS.density * 0.001;
    expect(
      calculations({ leak_speed: 1 }, varsFlare).Emissions_t_CO2eq_year,
    ).toBeCloseTo(t_y * 25.25);
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

  it("passes through equipmentType, serial_number, GWP, GWP_Minus, uncertainty, Operating_mode", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.equipmentType).toBe("GFM 2.0");
    expect(result.serial_number).toBeNull();
    expect(result.GWP).toBe(28);
    expect(result.GWP_Minus).toBe(25.25);
    expect(result.uncertainty).toBe(0.1);
    expect(result.Operating_mode).toBe(365);
  });

  it("Operating_mode affects annual methane loss proportionally", () => {
    const vars180 = { ...BASE_VARS, Operating_mode: 180 };
    const result365 = calculations({ leak_speed: 1 }, BASE_VARS);
    const result180 = calculations({ leak_speed: 1 }, vars180);
    expect(result180.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(M3_Y(1, 180));
    expect(result365.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(M3_Y(1, 365));
    expect(result180.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(
      result365.Total_Annual_Methane_Loss_m3_y * (180 / 365),
    );
  });

  it("flareShare and utilShare are fractions (0–1)", () => {
    const result = calculations({ leak_speed: 1 }, BASE_VARS);
    expect(result.flareShare).toBeCloseTo(0.5);
    expect(result.utilShare).toBeCloseTo(0.5);
  });

  /* ==============================================
     gasPercentage
  ============================================== */
  describe("gasPercentage", () => {
    const PINK_VARS = {
      ...BASE_VARS,
      equipmentType: "Розовый мешок",
      uncertainty: 0.1,
    };
    const LEAK = { leak_speed: 10, pressure: 0.2, temperature: 20 }; // pressure в МПа

    it("Розовый мешок: leak_rate вычисляется через stdSpeed с gasPercentage=100", () => {
      const expected = stdSpeed(10, 0.2, 20, 100);
      const result = calculations(LEAK, PINK_VARS);
      expect(result.leak_speed_kg_m).toBeCloseTo(expected * BASE_VARS.density);
    });

    it("recognizes legacy pink bag equipment names", () => {
      expect(isPinkBagEquipment("Розовый мешок")).toBe(true);
      expect(isPinkBagEquipment(" pink bag ")).toBe(true);
      expect(isPinkBagEquipment("GFM 2.0")).toBe(false);
    });

    it("gasPercentage=50 вдвое уменьшает leak_rate относительно gasPercentage=100", () => {
      const result100 = calculations(LEAK, PINK_VARS);
      const result50 = calculations(LEAK, { ...PINK_VARS, gasPercentage: 50 });
      expect(result50.leak_speed_kg_m).toBeCloseTo(
        result100.leak_speed_kg_m / 2,
      );
    });

    it("gasPercentage=0 даёт нулевой поток и нулевые потери", () => {
      const result = calculations(LEAK, { ...PINK_VARS, gasPercentage: 0 });
      expect(result.leak_speed_kg_m).toBeCloseTo(0);
      expect(result.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(0);
      expect(result.Emissions_t_CO2eq_year).toBeCloseTo(0);
    });

    it("gasPercentage пропорционально влияет на годовые потери (Розовый мешок)", () => {
      const result100 = calculations(LEAK, PINK_VARS);
      const result80 = calculations(LEAK, { ...PINK_VARS, gasPercentage: 80 });
      expect(result80.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(
        result100.Total_Annual_Methane_Loss_m3_y * 0.8,
      );
    });

    it("gasPercentage не влияет на расчёт для не-Розовый-мешок оборудования", () => {
      const r100 = calculations(
        { leak_speed: 10 },
        { ...BASE_VARS, gasPercentage: 100 },
      );
      const r50 = calculations(
        { leak_speed: 10 },
        { ...BASE_VARS, gasPercentage: 50 },
      );
      expect(r50.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(
        r100.Total_Annual_Methane_Loss_m3_y,
      );
      expect(r50.leak_speed_kg_m).toBeCloseTo(r100.leak_speed_kg_m);
    });

    it("годовые потери Розовый мешок совпадают с ручным расчётом", () => {
      const expected_m3_y =
        (stdSpeed(10, 0.2, 20, 100) * 1440 * 365 * UF) / 1000;
      const result = calculations(LEAK, PINK_VARS);
      expect(result.Total_Annual_Methane_Loss_m3_y).toBeCloseTo(expected_m3_y);
    });
  });
});
