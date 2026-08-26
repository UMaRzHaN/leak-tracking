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

function toFiniteNumber(value) {
  if (value === "" || value == null) return null;
  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/**
 * Returns field-level validation codes for measurements entered on the leak
 * form. Pink Bag measurements need pressure and an absolute temperature above
 * zero because both values are divisors/multipliers in the STP conversion.
 */
export function getLeakCalculationFieldErrors(leak = {}, vars = {}) {
  const errors = {};
  const leakSpeed = toFiniteNumber(leak.leak_speed);

  if (leak.leak_speed != null && leak.leak_speed !== "" && leakSpeed == null) {
    errors.leak_speed = "finite";
  } else if (leakSpeed != null && leakSpeed < 0) {
    errors.leak_speed = "non_negative";
  }

  if (isPinkBagEquipment(vars?.equipmentType)) {
    const pressure = toFiniteNumber(leak.pressure);
    const temperature = toFiniteNumber(leak.temperature);
    if (pressure == null || pressure <= 0) errors.pressure = "positive";
    if (temperature == null || temperature <= -273.15) {
      errors.temperature = "above_absolute_zero";
    }
  }

  return errors;
}

export function hasValidCalculationParameters(vars = {}) {
  const inRange = (value, min, max) => {
    const number = toFiniteNumber(value);
    return number != null && number >= min && number <= max;
  };
  const nonNegative = (value) => {
    const number = toFiniteNumber(value);
    return number != null && number >= 0;
  };
  // Плотность — единственная величина, которую проверяли без этой обёртки:
  // `toFiniteNumber(...) > 0` для пустого значения давало `null > 0`, то есть
  // ложь, и работало по совпадению правил сравнения, а не по замыслу.
  const positive = (value) => {
    const number = toFiniteNumber(value);
    return number != null && number > 0;
  };

  return (
    positive(vars.density) &&
    nonNegative(vars.GWP) &&
    nonNegative(vars.GWP_Minus) &&
    inRange(vars.percentage_gas_to_flare, 0, 100) &&
    inRange(vars.percentage_gas_to_utilization, 0, 100) &&
    inRange(vars.gasPercentage, 0, 100) &&
    inRange(vars.uncertainty, 0, 100) &&
    inRange(vars.Operating_mode, 1, 365)
  );
}

export const calculations = (leak, vars) => {
  if (!leak || !vars) return leak;
  if (
    !hasValidCalculationParameters(vars) ||
    Object.keys(getLeakCalculationFieldErrors(leak, vars)).length > 0
  ) {
    return leak;
  }

  /* =========================
     NORMALIZED INPUTS
  ========================= */
  const leakSpeed = toFiniteNumber(leak.leak_speed);
  const temperature = toFiniteNumber(leak.temperature);
  const pressure = toFiniteNumber(leak.pressure);
  const density = toFiniteNumber(vars.density);
  const GWP = toFiniteNumber(vars.GWP);
  const GWP_Minus = toFiniteNumber(vars.GWP_Minus);
  const percentageGasToFlare = toFiniteNumber(vars.percentage_gas_to_flare);
  const percentageGasToUtilization = toFiniteNumber(
    vars.percentage_gas_to_utilization,
  );
  const gasPercentage = toFiniteNumber(vars.gasPercentage);
  const uncertainty = toFiniteNumber(vars.uncertainty);
  const operatingMode = toFiniteNumber(vars.Operating_mode);
  const { equipmentType, serial_number } = vars;

  if (
    leakSpeed == null ||
    density == null ||
    GWP == null ||
    GWP_Minus == null ||
    percentageGasToFlare == null ||
    percentageGasToUtilization == null ||
    gasPercentage == null ||
    uncertainty == null ||
    operatingMode == null
  ) {
    return leak;
  }

  /* =========================
     CONSTANTS
  ========================= */
  const minutesPerYear = 1440 * operatingMode;
  const kgToTon = 0.001;

  /* =========================
     NORMALIZATION
  ========================= */
  const uncertaintyFactor = (100 - uncertainty) / 100;
  const flareShare = percentageGasToFlare / 100;
  const utilShare = percentageGasToUtilization / 100;
  const temperature_K = temperature == null ? null : temperature + 273.15;

  let leakRate = leakSpeed;
  if (isPinkBagEquipment(equipmentType)) {
    if (pressure == null || temperature_K == null || temperature_K <= 0) {
      return leak;
    }
    leakRate =
      ((leakSpeed * pressure) / temperature_K) * 273.15 * (gasPercentage / 100);
  }

  const leak_speed_kg_m = (leakRate * density) / 1000;
  const leak_speed_kg_h = leak_speed_kg_m * 60;
  const Total_Annual_Methane_Loss_m3_y = (leakRate * minutesPerYear) / 1000;
  const Total_Annual_Methane_Loss_kg_y =
    Total_Annual_Methane_Loss_m3_y * density;
  const Total_Annual_Methane_Loss_t_y =
    Total_Annual_Methane_Loss_kg_y * kgToTon;
  const weightedGWP = flareShare * GWP_Minus + utilShare * GWP;
  const Emissions_t_CO2eq_year =
    Total_Annual_Methane_Loss_t_y * weightedGWP * uncertaintyFactor;
  const Emissions_kg_CO2_eq_year = Emissions_t_CO2eq_year * 1000;

  const derivedValues = [
    flareShare,
    utilShare,
    ...(temperature_K == null ? [] : [temperature_K]),
    leakRate,
    leak_speed_kg_m,
    leak_speed_kg_h,
    Total_Annual_Methane_Loss_m3_y,
    Total_Annual_Methane_Loss_kg_y,
    Total_Annual_Methane_Loss_t_y,
    weightedGWP,
    Emissions_t_CO2eq_year,
    Emissions_kg_CO2_eq_year,
  ];
  if (!derivedValues.every(Number.isFinite)) return leak;

  return {
    ...leak,
    leak_speed: leakSpeed,
    ...(temperature == null ? {} : { temperature }),
    ...(pressure == null ? {} : { pressure }),
    flareShare,
    utilShare,
    temperature_K,
    leak_speed_kg_m,
    leak_speed_kg_h,
    Total_Annual_Methane_Loss_m3_y,
    Total_Annual_Methane_Loss_kg_y,
    Total_Annual_Methane_Loss_t_y,
    Emissions_t_CO2eq_year,
    Emissions_kg_CO2_eq_year,
    equipmentType,
    serial_number,
    // Единственный параметр расчёта, который сюда не попадал, хотя выгрузка
    // пишет его обязательной колонкой, а импорт возвращает полем верхнего
    // уровня. Из-за этого повторный импорт неизменённого архива показывал
    // «изменённое поле» на записи, где ничего не менялось, и при слиянии
    // ставил свежую отметку в `_fieldUpdatedAt` — выдуманная правка, которая
    // умеет побить настоящую правку с другого устройства.
    gasPercentage,
    uncertainty,
    GWP,
    GWP_Minus,
    weightedGWP,
    Operating_mode: operatingMode,
  };
};

export default calculations;
