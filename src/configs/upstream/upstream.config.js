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
import {
  splitExcelColumns,
  withRequiredExcelColumns,
} from "@/configs/shared/excel";
import {
  COPY_FIELDS as COMPONENT_COPY_FIELDS,
  FIELDS as COMPONENT_FIELDS,
  NUMBER_FIELDS as COMPONENT_NUMBER_FIELDS,
  REQUIRED_FIELDS as COMPONENT_REQUIRED_FIELDS,
  SEARCH_FIELDS as COMPONENT_SEARCH_FIELDS,
} from "./data/componentFields";
import { COMPONENT_STEPS } from "./data/componentSteps";
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

/**
 * Mirrors the column order of "Database component.xlsx" so the registry sheet
 * drops straight into the customer's existing reporting. Two deviations, both
 * deliberate: Подразделение/Месторождение are added so the sheet identifies its
 * own scope, and the source's single "Координаты" column is split into X and Y
 * to match how the leak sheet in the same workbook already writes them.
 *
 * Built with splitExcelColumns, not withRequiredExcelColumns — the latter
 * injects leak-only columns (время обнаружения, оборудование для замера,
 * погрешность) that mean nothing for a piece of equipment.
 */
const COMPONENT_EXCEL_COLUMNS = [
  { key: "index", header: "№" },
  { key: "subdivision", header: "Подразделение" },
  { key: "deposit", header: "Месторождение" },
  { key: "location", header: "Местонахождения" },
  { key: "component_name", header: "Наименование компонента" },
  { key: "component_name_en", header: "Component name" },
  { key: "component_uid", header: "Индивидуальный номер компонента" },
  { key: "scheme_tag", header: "Инвентаризационный номер на схеме" },
  { key: "process_line", header: "Location" },
  { key: "diameter", header: "Diameter (mm)" },
  { key: "line_pressure", header: "Pressure P, Mpa" },
  { key: "component_type", header: "Тип компонента" },
  { key: "equipment_type", header: "Тип оборудования" },
  { key: "nominal_diameter", header: "Номинальный диаметр компонента" },
  { key: "nominal_pressure", header: "Номинальное давление компонента" },
  { key: "working_pressure", header: "Рабочее давление" },
  { key: "working_temperature", header: "Рабочая температура" },
  { key: "connection_type", header: "Тип соединения" },
  { key: "medium", header: "Среда применения" },
  { key: "body_material", header: "Материал Корпуса" },
  { key: "actuator_type", header: "Тип привода" },
  { key: "installation_type", header: "Тип установки" },
  { key: "installed_at", header: "Дата монтажа" },
  { key: "inspected_at", header: "Дата Инспекции" },
  { key: "manufacturer", header: "Производитель" },
  { key: "component_status", header: "Статус компонента" },
  { key: "lat", header: "Координата X" },
  { key: "lng", header: "Координата Y" },
  { key: "photo", header: "Фото" },
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
   * untouched; consumers reach this block through the component-specific
   * helpers in projectAdapter.
   *
   * A project type without this block simply has no registry — the section
   * never appears. That keeps the feature switch derived from config, the way
   * the adapter already promises, instead of a comparison against the project
   * type somewhere in the UI.
   */
  components: {
    steps: { mode: "manual", steps: COMPONENT_STEPS },
    system: {
      fields: COMPONENT_FIELDS,
      numeric: COMPONENT_NUMBER_FIELDS,
      copyable: COMPONENT_COPY_FIELDS,
      search: COMPONENT_SEARCH_FIELDS,
      required: COMPONENT_REQUIRED_FIELDS,
      identity: "component_uid",
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
        purpose: "sheet",
        direction: ["export"],
        sheet: "Компоненты",
        ...splitExcelColumns(COMPONENT_EXCEL_COLUMNS),
      },
    },
  },
});

export default UPSTREAM_CONFIG;
