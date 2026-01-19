export const DETAIL_FIELDS = [
  { key: "date", label: "Дата" },
  { key: "field", label: "Месторождение" },
  { key: "station", label: "КС" },
  { key: "location", label: "Локация" },
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },

  { key: "leak_id", label: "Бирка" },
  { key: "video_id", label: "Видео" },

  {
    key: "leak_description",
    label: "Описание",
    multiline: true,
  },
  {
    key: "leak_cause",
    label: "Причина утечки",
    multiline: true,
  },
  {
    key: "technological_solution",
    label: "Технологическое решение",
    multiline: true,
  },
  {
    key: "repair_recommendation",
    label: "Рекомендации по ремонту",
    multiline: true,
  },
  {
    key: "materials_equipment",
    label: "Материалы и оборудование",
    multiline: true,
  },
  {
    key: "note",
    label: "Примечание",
    multiline: true,
  },

  { key: "leak_speed", label: "Скорость утечки" },
  { key: "leak_speed_kg", label: "Скорость (кг/ч)" },
  { key: "pressure", label: "Давление" },
  { key: "temperature", label: "Температура" },
];
