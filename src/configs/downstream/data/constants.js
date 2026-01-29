export const REQUIRED_FIELDS = ["leak_id", "video_id", "leak_speed"];

export const NUMBER_FIELDS = [
  "leak_id",
  "video_id",
  "leak_speed",
  "temperature",
  "pressure",
];

export const COPYABLE_FIELDS = [
  "district",
  "locality",
  "address",
  "object",
  "component",
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
  "category",
];
export const SEARCH_FIELDS = [
  { key: "all", label: "По всем полям" },
  { key: "date", label: "Дата обнаружения" },
  { key: "leak_id", label: "Индивидуальный номер утечки (бирка)" },
  { key: "video_id", label: "Индивидуальный номер видео" },
  { key: "district", label: "Район" },
  { key: "locality", label: "Населенный пункт" },
  { key: "address", label: "Адрес" },
  { key: "object", label: "Объект" },
  { key: "category", label: "Категория" },
  { key: "component", label: "Компонент" },
  { key: "leak_description", label: "Описание утечки" },
  { key: "technological_solution", label: "Технологическое решение" },
  { key: "repair_recommendation", label: "Решение / План устранения" },
  { key: "materials_equipment", label: "МТР ремонта" },
  { key: "actuator_type", label: "Тип привода" },
  { key: "connection_type", label: "Тип присоединения" },
  { key: "installation_type", label: "Тип установки" },
  { key: "note", label: "Примечание" },
];
