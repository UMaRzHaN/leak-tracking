import { COPY_FIELDS, FIELDS, NUMBER_FIELDS } from "./data/fields";
import { STEPS } from "./data/steps";
import { SEARCH_FIELDS_HEAD, SEARCH_FIELDS_TAIL } from "@/configs/shared/fields";
import {
  cause,
  description,
  solutions,
  recommendations,
  connection_type,
  installation_type,
  actuator_type,
} from "@/data/leak/fieldDictionary";

const SEARCH_FIELDS = [
  ...SEARCH_FIELDS_HEAD,
  { key: "field",      label: "УМГ" },
  { key: "station",    label: "Компрессорная станция" },
  { key: "location",   label: "Локация" },
  { key: "leak_cause", label: "Причина утечки" },
  ...SEARCH_FIELDS_TAIL,
];

const EXCEL_HEADERS = [
  "№", "Дата обнаружения",
  "УМГ", "Компрессорная станция", "Локация",
  "Объект", "Компонент", "Индивидуальный номер утечки", "Номер видео",
  "Описание утечки", "Причина утечки", "Технологическое решение",
  "Решение / План устранения", "МТР ремонта (предполагаемый)", "Примечание",
  "Измеренная скорость утечки, л/мин", "Измеренная скорость утечки, кг/ч",
  "Давление, атм", "Температура, °C", "Температура, К",
  "Процент газа на сжигание", "Процент газа на использование",
  "Общие годовые потери метана CH₄, м³/год", "Годовые потери метана CH₄, т/год",
  "Выбросы, CO₂-экв, т/год", "Выбросы, кг CO₂, т/год",
  "Потенциал глобального потепления",
  "Тип привода", "Тип присоединения", "Тип установки",
  "Координата X", "Координата Y", "Фото утечки",
  "Статус", "Фото после ремонта", "Дата устранения",
];

const EXCEL_KEYS = [
  "index", "date",
  "field", "station", "location",
  "object", "component", "leak_id", "video_id",
  "leak_description", "leak_cause", "technological_solution",
  "repair_recommendation", "materials_equipment", "note",
  "leak_speed", "leak_speed_kg_h",
  "pressure", "temperature", "temperature_K",
  "flareShare", "utilShare",
  "Total_Annual_Methane_Loss_m3_y", "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year", "Emissions_kg_CO2_eq_year",
  "GWP",
  "actuator_type", "connection_type", "installation_type",
  "lat", "lng", "photo",
  "status", "photo_after", "resolvedAt",
];

const MIDSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: [
      "field", "station", "location",
      "object", "component", "leak_id", "video_id",
      "leak_speed", "pressure", "temperature",
      "leak_description", "leak_cause",
      "technological_solution", "repair_recommendation", "materials_equipment", "note",
      "actuator_type", "connection_type", "installation_type",
    ],
    synonymsFields: [
      "leak_cause", "repair_recommendation", "leak_description",
      "component", "actuator_type", "connection_type", "installation_type",
    ],
  },
  semantic: {
    leak_cause:              cause,
    leak_description:        description,
    technological_solution:  solutions,
    repair_recommendation:   recommendations,
    actuator_type,
    installation_type,
    connection_type,
  },
  system: {
    numeric:  NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search:   SEARCH_FIELDS,
    lossy:    ["rawVoiceText", "note"],
    fields:   FIELDS,
    location: {
      main: "field", secondary: "station", last: "location",
      main_label: "УМГ", label: "Станция",
    },
  },
  export: {
    excel: {
      format: "XLSX", purpose: "table", direction: ["import", "export"], handler: null,
      headers: EXCEL_HEADERS,
      keysOrder: EXCEL_KEYS,
    },
  },
});

export default MIDSTREAM_CONFIG;
