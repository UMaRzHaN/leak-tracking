import { COPY_FIELDS, FIELDS, NUMBER_FIELDS } from "./data/fields";
import { STEPS } from "./data/steps";
import {
  SEARCH_FIELDS_HEAD,
  SEARCH_FIELDS_TAIL,
} from "@/configs/shared/fields";
import { withRequiredExcelColumns } from "@/configs/shared/excel";
import {
  cause,
  description,
  solutions,
  recommendations,
  connection_type,
  installation_type,
  actuator_type,
  categories_up,
} from "@/data/leak/fieldDictionary";

const SEARCH_FIELDS = [
  ...SEARCH_FIELDS_HEAD,
  { key: "subdivision", label: "Подразделение" },
  { key: "deposit", label: "Месторождение" },
  { key: "location", label: "Локация" },
  { key: "category", label: "Категория" },
  ...SEARCH_FIELDS_TAIL,
];

const EXCEL_COLUMNS = [
  { key: "index", header: "№" },
  { key: "date", header: "Дата обнаружения" },
  { key: "subdivision", header: "Подразделение" },
  { key: "deposit", header: "Месторождение" },
  { key: "location", header: "Локация" },
  { key: "object", header: "Объект" },
  { key: "category", header: "Категория" },
  { key: "leak_id", header: "Индивидуальный номер утечки" },
  { key: "component", header: "Компонент" },
  { key: "video_id", header: "Номер видео" },
  { key: "pressure", header: "Давление, атм" },
  { key: "temperature", header: "Температура, °C" },
  { key: "temperature_K", header: "Температура, К" },
  { key: "equipmentType", header: "Оборудование для замера объёма утечки" },
  { key: "serial_number", header: "Серийный номер оборудования" },
  { key: "uncertainty", header: "Погрешность" },
  { key: "leak_speed", header: "Измеренная скорость утечки, л/мин" },
  { key: "leak_description", header: "Описание утечки" },
  { key: "technological_solution", header: "Технологическое решение" },
  { key: "materials_equipment", header: "МТР ремонта (предполагаемый)" },
  { key: "note", header: "Примечание" },
  { key: "leak_speed_kg_h", header: "Измеренная скорость утечки, кг/ч" },
  { key: "flareShare", header: "Процент газа на сжигание" },
  { key: "utilShare", header: "Процент газа на использование" },
  { key: "Operating_mode", header: "Наработка (дней)" },
  {
    key: "Total_Annual_Methane_Loss_m3_y",
    header: "Общие годовые потери метана CH₄, м³/год",
  },
  {
    key: "Total_Annual_Methane_Loss_t_y",
    header: "Годовые потери метана CH₄, т/год",
  },
  { key: "Emissions_t_CO2eq_year", header: "Выбросы, CO₂-экв, т/год" },
  { key: "Emissions_kg_CO2_eq_year", header: "Выбросы, кг CO₂, т/год" },
  { key: "weightedGWP", header: "Потенциал глобального потепления" },
  { key: "actuator_type", header: "Тип привода" },
  { key: "connection_type", header: "Тип присоединения" },
  { key: "installation_type", header: "Тип установки" },
  { key: "lat", header: "Координата X" },
  { key: "lng", header: "Координата Y" },
  { key: "photo", header: "Фото утечки" },
  { key: "status", header: "Статус" },
  { key: "photo_after", header: "Фото после ремонта" },
  { key: "resolvedAt", header: "Дата устранения" },
];

const UPSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: [
      "subdivision",
      "deposit",
      "location",
      "object",
      "component",
      "leak_id",
      "video_id",
      "leak_speed",
      "pressure",
      "temperature",
      "leak_description",
      "technological_solution",
      "repair_recommendation",
      "materials_equipment",
      "note",
      "actuator_type",
      "connection_type",
      "installation_type",
    ],
    synonymsFields: [
      "component",
      "actuator_type",
      "connection_type",
      "installation_type",
      "leak_description",
      "repair_recommendation",
    ],
  },
  semantic: {
    leak_cause: cause,
    leak_description: description,
    technological_solution: solutions,
    repair_recommendation: recommendations,
    actuator_type,
    installation_type,
    connection_type,
    category: categories_up,
  },
  system: {
    numeric: NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search: SEARCH_FIELDS,
    lossy: ["rawVoiceText", "note"],
    fields: FIELDS,
    location: {
      main: "subdivision",
      secondary: "deposit",
      last: "location",
      main_label: "Подразделение",
      label: "Месторождение",
    },
  },
  export: {
    excel: {
      format: "XLSX",
      purpose: "table",
      direction: ["import", "export"],
      handler: null,
      ...withRequiredExcelColumns(EXCEL_COLUMNS),
    },
  },
});

export default UPSTREAM_CONFIG;
