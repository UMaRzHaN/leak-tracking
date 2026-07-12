/**
 * Pure calculation function
 * leak  – данные утечки (из data)
 * vars  – параметры проекта (из storage_key)
 */
export function isPinkBagEquipment(equipmentType) {
  const normalized = String(equipmentType ?? "")
    .trim()
    .toLowerCase();

  return (
    normalized === "розовый мешок" ||
    normalized === "pink bag" ||
    normalized === "pinkbag"
  );
}

export const calculations = (leak, vars) => {
  if (!leak || !vars) return leak;
  if (!vars.Operating_mode || vars.Operating_mode <= 0) return leak;

  /* =========================
     INPUTS
  ========================= */
  const {
    leak_speed, // л/мин
    temperature, // °C (опционально)
    pressure, // атм (опционально)
  } = leak;

  const {
    density, // кг/м3
    GWP, // GWP (например 28)
    GWP_Minus, // GWP_Minus (например 25.25)
    percentage_gas_to_flare, // %
    percentage_gas_to_utilization, // %
    gasPercentage, // %
    equipmentType,
    serial_number,
    uncertainty,
    Operating_mode,
  } = vars;

  /* =========================
     CONSTANTS
  ========================= */
  const MINUTES_PER_YEAR = 1440 * Operating_mode; // дней × минут в сутках
  const KG_TO_TON = 0.001;

  /* =========================
     NORMALIZATION
  ========================= */
  const uncertaintyFactor = (100 - uncertainty) / 100;
  const flareShare = percentage_gas_to_flare / 100;
  const utilShare = percentage_gas_to_utilization / 100;

  /* =========================
     TEMPERATURE
  ========================= */
  const temperature_K =
    typeof temperature === "number" ? temperature + 273.15 : null;

  /* =========================
     MASS FLOW
  ========================= */
  const leak_speed_standard =
    ((leak_speed * pressure) / temperature_K) * 273.15 * (gasPercentage / 100); // нормализуем к стандартным условиям (0°C, 1 атм) и учитываем процент газа в смеси
  const leak_rate = isPinkBagEquipment(equipmentType)
    ? leak_speed_standard
    : leak_speed;
  const leak_speed_kg_m = leak_rate * density;

  /* =========================
     ANNUAL LOSSES
  ========================= */
  const Total_Annual_Methane_Loss_m3_y =
    (leak_rate * MINUTES_PER_YEAR * uncertaintyFactor) / 1000;

  const Total_Annual_Methane_Loss_kg_y =
    Total_Annual_Methane_Loss_m3_y * density;

  const Total_Annual_Methane_Loss_t_y =
    Total_Annual_Methane_Loss_kg_y * KG_TO_TON;

  /* =========================
     CO2-EQUIVALENT EMISSIONS
  ========================= */
  const weightedGWP = flareShare * GWP_Minus + utilShare * GWP; // утилизация эффективнее факела

  const Emissions_t_CO2eq_year = Total_Annual_Methane_Loss_t_y * weightedGWP;

  const Emissions_kg_CO2_eq_year = Emissions_t_CO2eq_year * 1000;

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
    GWP,
    GWP_Minus,
    weightedGWP,
    Operating_mode,
  };
};
export default calculations;
