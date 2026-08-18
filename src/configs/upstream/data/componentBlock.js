import {
  COPY_FIELDS,
  FIELDS,
  NUMBER_FIELDS,
  REQUIRED_FIELDS,
  SEARCH_FIELDS,
} from "./componentFields";
import { COMPONENT_STEPS } from "./componentSteps";
import { splitExcelColumns } from "@/configs/shared/excel";

/**
 * The upstream component registry, loaded on demand.
 *
 * Split out of upstream.config.js because that file sits in the entry graph:
 * the dictionaries and the four-step form behind this block are needed only
 * once somebody opens the registry, and inlining them charged every cold start
 * for a screen most sessions never reach.
 */

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
  { key: "component", header: "Наименование компонента" },
  { key: "component_name_en", header: "Component name" },
  { key: "component_uid", header: "Индивидуальный номер компонента" },
  { key: "scheme_tag", header: "Инвентаризационный номер на схеме" },
  { key: "object", header: "Location" },
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

const COMPONENT_BLOCK = Object.freeze({
  steps: { mode: "manual", steps: COMPONENT_STEPS },
  system: {
    fields: FIELDS,
    numeric: NUMBER_FIELDS,
    copyable: COPY_FIELDS,
    search: SEARCH_FIELDS,
    required: REQUIRED_FIELDS,
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
});

export default COMPONENT_BLOCK;
