import {
  COPY_FIELDS,
  FIELDS,
  NUMBER_FIELDS,
  REQUIRED_FIELDS,
  SEARCH_FIELDS,
} from "./componentFields";
import { COMPONENT_STEPS } from "./componentSteps";
import { splitExcelColumns } from "@/configs/shared/excel";
import {
  body_materials,
  component_names,
  component_statuses,
  component_types,
  equipment_types,
  mediums,
} from "@/data/component/componentDictionary";

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
 * drops straight into the customer's existing reporting. Three deviations, all
 * deliberate: the source's single "Местонахождения" column becomes the four the
 * app actually records against — Подразделение, Месторождение, Локация,
 * Объект — its single "Координаты" column is split into X and Y to match how
 * the leak sheet in the same workbook already writes them, and the row number
 * leads.
 *
 * Built with splitExcelColumns, not withRequiredExcelColumns — the latter
 * injects leak-only columns (время обнаружения, оборудование для замера,
 * погрешность) that mean nothing for a piece of equipment.
 */
const COMPONENT_EXCEL_COLUMNS = [
  { key: "index", header: "№" },
  { key: "subdivision", header: "Подразделение" },
  { key: "deposit", header: "Месторождение" },
  { key: "location", header: "Локация" },
  { key: "object", header: "Объект" },
  { key: "component", header: "Наименование компонента" },
  { key: "component_name_en", header: "Component name" },
  { key: "component_uid", header: "Индивидуальный номер компонента" },
  { key: "scheme_tag", header: "Инвентаризационный номер на схеме" },
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

/**
 * Что голос вправе заполнить в карточке компонента.
 *
 * Сначала здесь были только поля, общие с утечкой, — и голос заполнял пятую
 * часть карточки, а остальное человек дописывал руками, стоя у железа с
 * телефоном в одной руке. Теперь распознаватель знает и паспортные величины:
 * они читаются с таблички вслух ровно так же, как всё прочее.
 *
 * Дата монтажа сюда намеренно не входит: её берут календарём, а
 * продиктованная дата — это спор о том, что значит «двенадцатое пятое».
 *
 * `options` — списки допустимых значений. Услышанное «запорная арматура»
 * сопоставляется с «Запорная арматура» из словаря, иначе в карточку попадала
 * бы строка, которой нет ни в одном выпадающем списке.
 */
const COMPONENT_VOICE = {
  outputFields: [
    // Место: голос кладёт услышанное на уровни иерархии этого типа проекта.
    "subdivision",
    "deposit",
    "location",
    "object",
    // Что это за железо.
    "component",
    "component_uid",
    "scheme_tag",
    "component_type",
    "equipment_type",
    // Что написано на табличке.
    "nominal_diameter",
    "nominal_pressure",
    "working_pressure",
    "working_temperature",
    "connection_type",
    "actuator_type",
    "installation_type",
    "medium",
    "body_material",
    "manufacturer",
    "component_status",
  ],
  synonymsFields: [
    "component",
    "actuator_type",
    "connection_type",
    "installation_type",
  ],
  options: {
    /*
     * Места здесь нет намеренно. В словаре стоит «Скважина» — вид узла, — а
     * говорят «Скважина 22», и сведение к словарю отрезало бы номер, то есть
     * ровно то, что отличает один узел от другого.
     */
    component: component_names,
    component_type: component_types,
    equipment_type: equipment_types,
    medium: mediums,
    body_material: body_materials,
    component_status: component_statuses,
  },
};

const COMPONENT_BLOCK = Object.freeze({
  steps: { mode: "manual", steps: COMPONENT_STEPS },
  voice: COMPONENT_VOICE,
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
