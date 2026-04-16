/**
 * Shared field definitions used across all project types (upstream / midstream / downstream).
 * Each group is a building block — project configs compose them into their FIELDS array.
 *
 * Property order convention: key, label, viewable, editable, copyable, numeric, multiline, coord
 */

export const DATE_FIELD = {
  key: "date", label: "Дата", viewable: true, editable: false,
};

export const IDENTIFIER_FIELDS = [
  { key: "leak_id",  label: "Индивидуальный номер утечки", viewable: true, editable: true, numeric: true },
  { key: "video_id", label: "Индивидуальный номер видео",  viewable: true, editable: true, numeric: true },
];

export const OBJECT_FIELDS = [
  { key: "object",    label: "Объект",    viewable: true, editable: true, copyable: true },
  { key: "component", label: "Компонент", viewable: true, editable: true, copyable: true },
];

export const TYPE_FIELDS = [
  { key: "actuator_type",     label: "Тип привода",       viewable: true, editable: true, copyable: true, multiline: true },
  { key: "connection_type",   label: "Тип присоединения", viewable: true, editable: true, copyable: true, multiline: true },
  { key: "installation_type", label: "Тип установки",     viewable: true, editable: true, copyable: true, multiline: true },
];

/** Used by upstream and downstream (not midstream). */
export const CATEGORY_FIELD = {
  key: "category", label: "Категория", viewable: true, editable: true, copyable: true,
};

/** Used by midstream only. */
export const LEAK_CAUSE_FIELD = {
  key: "leak_cause", label: "Причина утечки", viewable: true, editable: true, copyable: true, multiline: true,
};

export const DESCRIPTION_FIELDS = [
  { key: "leak_description",       label: "Описание утечки",           viewable: true, editable: true, copyable: true, multiline: true },
  { key: "technological_solution", label: "Технологическое решение",   viewable: true, editable: true, copyable: true, multiline: true },
  { key: "repair_recommendation",  label: "Решение / План устранения", viewable: true, editable: true, copyable: true, multiline: true },
  { key: "materials_equipment",    label: "Материалы и оборудование",  viewable: true, editable: true, copyable: true, multiline: true },
  { key: "note",                   label: "Примечание",                viewable: true, editable: true, copyable: true, multiline: true },
];

export const PARAM_FIELDS = [
  { key: "leak_speed",  label: "Скорость утечки, л/мин", viewable: true, editable: true, copyable: true, numeric: true },
  { key: "temperature", label: "Температура, °C",        viewable: true, editable: true, copyable: true, numeric: true },
  { key: "pressure",    label: "Давление, атм",          viewable: true, editable: true, copyable: true, numeric: true },
];

export const COORD_FIELDS = [
  { key: "lat", label: "Широта",  viewable: true, editable: true, numeric: true, coord: true },
  { key: "lng", label: "Долгота", viewable: true, editable: true, numeric: true, coord: true },
];

/**
 * Search field entries shared by all project types.
 * Each config splices in its location-specific entries after index 3 (after video_id).
 */
export const SEARCH_FIELDS_HEAD = [
  { key: "all",      label: "По всем полям" },
  { key: "date",     label: "Дата обнаружения" },
  { key: "leak_id",  label: "Индивидуальный номер утечки (бирка)" },
  { key: "video_id", label: "Индивидуальный номер видео" },
];

export const SEARCH_FIELDS_TAIL = [
  { key: "object",                 label: "Объект" },
  { key: "component",              label: "Компонент" },
  { key: "leak_description",       label: "Описание утечки" },
  { key: "technological_solution", label: "Технологическое решение" },
  { key: "repair_recommendation",  label: "Решение / План устранения" },
  { key: "materials_equipment",    label: "МТР ремонта" },
  { key: "actuator_type",          label: "Тип привода" },
  { key: "connection_type",        label: "Тип присоединения" },
  { key: "installation_type",      label: "Тип установки" },
  { key: "note",                   label: "Примечание" },
];
