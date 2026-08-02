import {
  COPY_FIELDS,
  FIELDS,
  NUMBER_FIELDS,
  VOICE_FIELDS,
} from "./data/fields";
import { STEPS } from "./data/steps";
import {
  SEARCH_FIELDS_HEAD,
  SEARCH_FIELDS_TAIL,
} from "@/configs/shared/fields";
import { withRequiredExcelColumns } from "@/configs/shared/excel";
import {
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
  { key: "district", label: "Район" },
  { key: "locality", label: "Населенный пункт" },
  { key: "address", label: "Адрес" },
  { key: "category", label: "Категория" },
  ...SEARCH_FIELDS_TAIL,
];

const EXCEL_COLUMNS = [
  { key: "index", header: "№" },
  { key: "date", header: "Дата обнаружения" },
  { key: "district", header: "Район" },
  { key: "locality", header: "Населенный пункт" },
  { key: "address", header: "Адрес" },
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
  { key: "Emissions_kg_CO2_eq_year", header: "Выбросы, CO₂, кг/год" },
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

const DOWNSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: VOICE_FIELDS.map((field) => field.key),
    synonymsFields: [
      "repair_recommendation",
      "leak_description",
      "component",
      "actuator_type",
      "connection_type",
      "installation_type",
    ],
  },
  semantic: {
    leak_description: description,
    technological_solution: solutions,
    repair_recommendation: recommendations,
    actuator_type,
    installation_type,
    connection_type,
    category: categories_down,
    address: addresses,
  },
  system: {
    numeric: NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search: SEARCH_FIELDS,
    lossy: ["rawVoiceText", "note"],
    fields: FIELDS,
    location: {
      main: "district",
      secondary: "locality",
      last: "address",
      main_label: "Район",
      label: "Населенный пункт",
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

export default DOWNSTREAM_CONFIG;
