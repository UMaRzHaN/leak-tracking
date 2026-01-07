import {
  density,
  GWP,
  percentage_gas_to_flare,
  percentage_gas_to_utilization,
} from "../data/variables";
export const calculations = (r) => {
  const leak_speed_kg = r.leak_speed * density;

  const Total_Annual_Methane_Loss_m3_y = r.leak_speed * 525.6;

  const Total_Annual_Methane_Loss_t_y =
    Total_Annual_Methane_Loss_m3_y * 0.0007168;

  const Emissions_t_CO2eq_year =
    Total_Annual_Methane_Loss_t_y *
    (percentage_gas_to_flare * 28 + percentage_gas_to_utilization * 25.25);

  const Emissions_kg_CO2_eq_year =
    Total_Annual_Methane_Loss_t_y *
    (percentage_gas_to_flare * 28 + percentage_gas_to_utilization * 25.25);

  return {
    ...r,
    leak_speed_kg,
    Total_Annual_Methane_Loss_m3_y,
    Total_Annual_Methane_Loss_t_y,
    Emissions_t_CO2eq_year,
    Emissions_kg_CO2_eq_year,
    GWP,
  };
};
export const headers = [
  "№",
  "Дата обнаружения",
  "УМГ",
  "Компрессорная станция",
  "Локация",
  "Объект",
  "Компонент",
  "Индивидуальный номер утечки",
  "Индивидуальный номер видео",
  "Описание утечки",
  "Причина утечки",
  "Технологическое решение",
  "Решение / План устранения",
  "МТР ремонта (предполагаемый)",
  "Примечание",
  "Измеренная скорость утечки, л/мин",
  "Измеренная скорость утечки, кг/ч",
  "Давление, атм",
  "Температура, °C",
  "Процент газа на сжигание",
  "Процент газа на использование",
  "Общие годовые потери метана CH₄, м³/год",
  "Годовые потери метана CH₄, т/год",
  "Выбросы, CO₂-экв, т/год",
  "Выбросы, кг CO₂, т/год",
  "Потенциал глобального потепления ",
  "Координата X, м",
  "Координата Y, м",
];
export const keysOrder = [
  "id",
  "date",
  "field",
  "station",
  "location",
  "object",
  "component",
  "leak_id",
  "video_id",
  "leak_description",
  "leak_cause",
  "technological_solution",
  "repair_recommendation",
  "materials_equipment",
  "note",
  "leak_speed",
  "leak_speed_kg",
  "pressure",
  "temperature",
  "Total_Annual_Methane_Loss_m3_y",
  "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year",
  "Emissions_kg_CO2_eq_year",
  "GWP",
  "latitude",
  "longitude",
];
export const normalizeRow = (row = {}) => {
  const result = {};

  Object.entries(row).forEach(([key, val]) => {
    if (val && typeof val === "object" && "value" in val && "text" in val) {
      result[`${key}_value`] = val.value ?? "";
      result[`${key}_text`] = val.text ?? "";
    } else {
      result[key] = val ?? "";
    }
  });

  return result;
};
export const normalizeNumber = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";
  let v = String(raw);
  v = v.replace(/[^\d.,]/g, "");
  v = v.replace(",", ".");
  v = v.replace(/(\..*)\./g, "$1");
  const num = Number(v);
  return Number.isFinite(num) ? num : "";
};
export const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") return v;

  const normalized = String(v).replace(",", ".");
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
};
