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

const UPSTREAM_CONFIG = Object.freeze({
  steps: { mode: "manual", steps: STEPS },
  voice: {
    input: "rawVoiceText",
    outputFields: VOICE_FIELDS.map((field) => field.key),
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

  /**
   * The component registry, declared as a sibling of the leak entity rather
   * than folded into it. Everything above keeps meaning "leak" and stays
   * untouched.
   *
   * Only the loader lives here. The block itself — field declarations, four
   * steps' worth of form, and the equipment dictionaries behind them — is
   * pulled in on demand, because this config is reached from the entry graph
   * and the registry is a screen most sessions never open. Declaring it inline
   * put roughly 11 kB of walk-only data into the chunk that gates first paint.
   *
   * A project type without this key simply has no registry — the section never
   * appears. The feature switch stays derived from config, the way the rest of
   * this adapter promises, and costs nothing to evaluate.
   */
  components: {
    load: () => import("./data/componentBlock"),
  },
});

export default UPSTREAM_CONFIG;
