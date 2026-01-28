/**
 * Объединённая структура полей
 * Каждое поле содержит:
 * - key: уникальный идентификатор
 * - label: название поля
 * - viewable: видимо ли в режиме просмотра
 * - editable: редактируемо ли в режиме редактирования
 * - viewOrder: порядок отображения при просмотре (числа от 1+)
 * - editOrder: порядок отображения при редактировании (числа от 1+)
 * - multiline: многострочное текстовое поле (опционально)
 */

export const FIELDS = [
  // Дата - только просмотр
  {
    key: "date",
    label: "Дата",
    viewable: true,
    editable: false,
    viewOrder: 1,
  },

  // Основные идентификаторы
  {
    key: "leak_id",
    label: "Индивидуальный номер утечки",
    viewable: true,
    editable: true,
    viewOrder: 7,
    editOrder: 1,
  },
  {
    key: "video_id",
    label: "Видео",
    viewable: true,
    editable: true,
    viewOrder: 8,
    editOrder: 2,
  },

  // Месторасположение
  {
    key: "field",
    label: "УМГ",
    viewable: true,
    editable: true,
    viewOrder: 2,
    editOrder: 6,
  },
  {
    key: "station",
    label: "Компрессорная станция",
    viewable: true,
    editable: true,
    viewOrder: 3,
    editOrder: 7,
  },
  {
    key: "location",
    label: "Локация",
    viewable: true,
    editable: true,
    viewOrder: 4,
    editOrder: 8,
  },
  {
    key: "object",
    label: "Объект",
    viewable: true,
    editable: true,
    viewOrder: 5,
    editOrder: 9,
  },
  {
    key: "component",
    label: "Компонент",
    viewable: true,
    editable: true,
    viewOrder: 6,
    editOrder: 10,
  },

  // Описания и решения
  {
    key: "leak_description",
    label: "Описание утечки",
    viewable: true,
    editable: true,
    viewOrder: 9,
    editOrder: 11,
    multiline: true,
  },
  {
    key: "leak_cause",
    label: "Причина утечки",
    viewable: true,
    editable: true,
    viewOrder: 10,
    editOrder: 12,
    multiline: true,
  },
  {
    key: "technological_solution",
    label: "Технологическое решение",
    viewable: true,
    editable: true,
    viewOrder: 11,
    editOrder: 13,
    multiline: true,
  },
  {
    key: "repair_recommendation",
    label: "Решение / План устранения",
    viewable: true,
    editable: true,
    viewOrder: 12,
    editOrder: 14,
    multiline: true,
  },
  {
    key: "materials_equipment",
    label: "Материалы и оборудование",
    viewable: true,
    editable: true,
    viewOrder: 13,
    editOrder: 15,
    multiline: true,
  },
  {
    key: "note",
    label: "Примечание",
    viewable: true,
    editable: true,
    viewOrder: 14,
    editOrder: 16,
    multiline: true,
  },

  // Технические параметры
  {
    key: "leak_speed",
    label: "Скорость утечки, л/мин",
    viewable: true,
    editable: true,
    viewOrder: 15,
    editOrder: 3,
  },
  {
    key: "pressure",
    label: "Давление, атм",
    viewable: true,
    editable: true,
    viewOrder: 16,
    editOrder: 5,
  },
  {
    key: "temperature",
    label: "Температура, °C",
    viewable: true,
    editable: true,
    viewOrder: 17,
    editOrder: 4,
  },

  // Координаты
  {
    key: "lat",
    label: "Координата Х",
    viewable: true,
    editable: true,
    viewOrder: 18,
    editOrder: 17,
  },
  {
    key: "lng",
    label: "Координата Y",
    viewable: true,
    editable: true,
    viewOrder: 19,
    editOrder: 18,
  },
];

// Фильтры для удобства (опционально, для обратной совместимости)
export const VIEW_FIELDS = FIELDS.filter((f) => f.viewable).sort(
  (a, b) => a.viewOrder - b.viewOrder,
);
export const EDIT_FIELDS = FIELDS.filter((f) => f.editable).sort(
  (a, b) => a.editOrder - b.editOrder,
);
