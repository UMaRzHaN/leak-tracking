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
  categories_down,
  addresses,
} from "@/data/leak/fieldDictionary";

const SEARCH_FIELDS = [
  ...SEARCH_FIELDS_HEAD,
  { key: "district",  label: "Район" },
  { key: "locality",  label: "Населенный пункт" },
  { key: "address",   label: "Адрес" },
  { key: "category",  label: "Категория" },
  ...SEARCH_FIELDS_TAIL,
];

const EXCEL_HEADERS = [
  "№", "Дата обнаружения",
  "Район", "Населенный пункт", "Адрес",
  "Объект", "Категория", "Индивидуальный номер утечки", "Компонент", "Номер видео",
  "Давление, атм", "Температура, °C", "Температура, К",
  "Оборудование для замера объёма утечки", "Серийный номер оборудования", "Погрешность",
  "Измеренная скорость утечки, л/мин", "Описание утечки", "Технологическое решение",
  "МТР ремонта (предполагаемый)", "Примечание",
  "Измеренная скорость утечки, кг/ч",
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
  "district", "locality", "address",
  "object", "category", "leak_id", "component", "video_id",
  "pressure", "temperature", "temperature_K",
  "equipmentType", "serial_number", "uncertainty",
  "leak_speed", "leak_description", "technological_solution",
  "materials_equipment", "note",
  "leak_speed_kg_h",
  "flareShare", "utilShare",
  "Total_Annual_Methane_Loss_m3_y", "Total_Annual_Methane_Loss_t_y",
  "Emissions_t_CO2eq_year", "Emissions_kg_CO2_eq_year",
  "GWP",
  "actuator_type", "connection_type", "installation_type",
  "lat", "lng", "photo",
  "status", "photo_after", "resolvedAt",
];

const DOWNSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: [
      "district", "locality", "address",
      "object", "component", "leak_id", "video_id",
      "leak_speed", "pressure", "temperature",
      "leak_description", "leak_cause",
      "technological_solution", "repair_recommendation", "materials_equipment", "note",
      "actuator_type", "connection_type", "installation_type",
    ],
    synonymsFields: [
      "repair_recommendation", "leak_description",
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
    category:                categories_down,
    address:                 addresses,
  },
  system: {
    numeric:  NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search:   SEARCH_FIELDS,
    lossy:    ["rawVoiceText", "note"],
    fields:   FIELDS,
    location: {
      main: "district", secondary: "locality", last: "address",
      main_label: "Район", label: "Населенный пункт",
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

export default DOWNSTREAM_CONFIG;
