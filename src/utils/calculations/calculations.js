/**
 * Pure calculation function
 * leak  – данные утечки (из data)
 * vars  – параметры проекта (из storage_key)
 */
export const calculations = (leak, vars) => {
  if (!leak || !vars) return leak;

  /* =========================
     INPUTS
  ========================= */
  const {
    leak_speed, // м3/ч
    temperature, // °C (опционально)
  } = leak;

  const {
    density, // кг/м3
    GWP_CH4, // GWP_CH4 CH4 (например 28)
    GWP_CH4_Minus, // GWP_CH4_Minus CH4 (например 25.25)
    percentage_gas_to_flare, // %
    percentage_gas_to_utilization, // %
    equipmentType,
    serial_number,
    uncertainty,
    Operating_mode,
  } = vars;

  /* =========================
     CONSTANTS
  ========================= */
  const MINUTES_PER_YEAR = 1440 * Operating_mode; // дней × минут в сутках
  const METHANE_DENSITY_STD = 0.7168; // кг/м3 (20°C, 1 атм)
  const KG_TO_TON = 0.001;

  /* =========================
     NORMALIZATION
  ========================= */
  const flareShare = percentage_gas_to_flare / 100;
  const utilShare = percentage_gas_to_utilization / 100;

  /* =========================
     MASS FLOW
  ========================= */
  const leak_speed_kg_m = leak_speed * density;

  /* =========================
     ANNUAL LOSSES
  ========================= */
  const Total_Annual_Methane_Loss_m3_y = (leak_speed * MINUTES_PER_YEAR) / 1000;

  const Total_Annual_Methane_Loss_kg_y =
    Total_Annual_Methane_Loss_m3_y * METHANE_DENSITY_STD;

  const Total_Annual_Methane_Loss_t_y =
    Total_Annual_Methane_Loss_kg_y * KG_TO_TON;

  /* =========================
     CO2-EQUIVALENT EMISSIONS
  ========================= */
  const weightedGWP_CH4 = flareShare * GWP_CH4_Minus + utilShare * GWP_CH4; // утилизация эффективнее факела

  const Emissions_t_CO2eq_year =
    Total_Annual_Methane_Loss_t_y * weightedGWP_CH4;

  const Emissions_kg_CO2_eq_year = Emissions_t_CO2eq_year * 1000;

  /* =========================
     TEMPERATURE
  ========================= */
  const temperature_K =
    typeof temperature === "number" ? temperature + 273.15 : null;

  /* =========================
     RESULT (NO SIDE EFFECTS)
  ========================= */
  return {
    ...leak,

    // normalized
    flareShare,
    utilShare,
    temperature_K,

    // mass & losses
    leak_speed_kg_m,
    Total_Annual_Methane_Loss_m3_y,
    Total_Annual_Methane_Loss_kg_y,
    Total_Annual_Methane_Loss_t_y,

    // emissions
    Emissions_t_CO2eq_year,
    Emissions_kg_CO2_eq_year,
    equipmentType,
    serial_number,
    uncertainty,
    GWP_CH4,
    GWP_CH4_Minus,
    weightedGWP_CH4,
    Operating_mode,
  };
};
export default calculations;
