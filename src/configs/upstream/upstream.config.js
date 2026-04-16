import { COPY_FIELDS, FIELDS, NUMBER_FIELDS } from "./data/fields";
import { STEPS } from "./data/steps";
import { SEARCH_FIELDS_HEAD, SEARCH_FIELDS_TAIL } from "../shared/fields";
import {
  cause,
  description,
  solutions,
  recommendations,
  connection_type,
  installation_type,
  actuator_type,
  categories_up,
} from "../../data/dictionaries";

const SEARCH_FIELDS = [
  ...SEARCH_FIELDS_HEAD,
  { key: "subdivision", label: "Подразделение" },
  { key: "deposit",     label: "Месторождение" },
  { key: "location",    label: "Локация" },
  { key: "category",    label: "Категория" },
  ...SEARCH_FIELDS_TAIL,
];

const EXCEL_HEADERS = [
  "№", "Дата обнаружения",
  "Подразделение", "Месторождение", "Локация",
  "Объект", "Категория", "Индивидуальный номер утечки", "Компонент", "Номер видео",
  "Давление, атм", "Температура, °C", "Температура, К",
  "Оборудование для замера объёма утечки", "Серийный номер оборудования", "Погрешность",
  "Измеренная скорость утечки, л/мин", "Описание утечки", "Технологическое решение",
  "МТР ремонта (предполагаемый)", "Примечание",
  "Тип привода", "Тип присоединения", "Тип установки",
  "Координата X", "Координата Y", "Фото утечки",
];

const EXCEL_KEYS = [
  "index", "date",
  "subdivision", "deposit", "location",
  "object", "category", "leak_id", "component", "video_id",
  "pressure", "temperature", "temperature_K",
  "equipmentType", "serial_number", "uncertainty",
  "leak_speed", "leak_description", "technological_solution",
  "materials_equipment", "note",
  "actuator_type", "connection_type", "installation_type",
  "lat", "lng", "photo",
];

const UPSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: [
      "subdivision", "deposit", "location",
      "object", "component", "leak_id", "video_id",
      "leak_speed", "pressure", "temperature",
      "leak_description", "leak_cause",
      "technological_solution", "repair_recommendation", "materials_equipment", "note",
      "actuator_type", "connection_type", "installation_type",
    ],
    synonymsFields: [
      "component", "actuator_type", "connection_type", "installation_type",
      "leak_description", "repair_recommendation",
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
    category:                categories_up,
  },
  system: {
    numeric:  NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search:   SEARCH_FIELDS,
    lossy:    ["rawVoiceText", "note"],
    fields:   FIELDS,
    location: {
      main: "subdivision", secondary: "deposit", last: "location",
      main_label: "Подразделение", label: "Месторождение",
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

export default UPSTREAM_CONFIG;
