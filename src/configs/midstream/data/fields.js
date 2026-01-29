/**
 * Объединённая структура полей
 * Каждое поле содержит:
 * - key: уникальный идентификатор
 * - label: название поля
 * - viewable: видимо ли в режиме просмотра
 * - editable: редактируемо ли в режиме редактирования
 * - multiline: многострочное текстовое поле (опционально)
 */

export const FIELDS = [
  // ===== ДАТА =====
  {
    key: "date",
    label: "Дата",
    viewable: true,
    editable: false,
  },

  // ===== ИДЕНТИФИКАТОРЫ =====
  {
    key: "leak_id",
    label: "Индивидуальный номер утечки",
    viewable: true,
    editable: true,
    numeric: true,
  },
  {
    key: "video_id",
    label: "Индивидуальный номер видео",
    viewable: true,
    editable: true,
    numeric: true,
  },

  // ===== МЕСТОПОЛОЖЕНИЕ =====
  {
    key: "field",
    label: "УМГ",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "Компрессорная станция",
    label: "station",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "location",
    label: "Локация",
    copyable: true,
    viewable: true,
    editable: true,
  },

  // ===== ОБЪЕКТ =====
  {
    key: "object",
    label: "Объект",
    copyable: true,
    viewable: true,
    editable: true,
  },
  {
    key: "component",
    label: "Компонент",
    viewable: true,
    editable: true,
    copyable: true,
  },

  // ===== ТИПЫ =====
  {
    key: "actuator_type",
    label: "Тип привода",
    multiline: true,
    viewable: true,
    copyable: true,
    editable: true,
  },
  {
    key: "connection_type",
    label: "Тип присоединения",
    multiline: true,
    viewable: true,
    copyable: true,
    editable: true,
  },
  {
    key: "installation_type",
    label: "Тип установки",
    multiline: true,
    copyable: true,
    viewable: true,
    editable: true,
  },

  // ===== КАТЕГОРИЯ =====
  {
    key: "category",
    label: "Категория",
    viewable: true,
    copyable: true,
    editable: true,
  },

  // ===== ОПИСАНИЕ =====
  {
    key: "leak_description",
    label: "Описание утечки",
    viewable: true,
    editable: true,
    copyable: true,

    multiline: true,
  },
  {
    key: "leak_cause",
    label: "Причина утечки",
    viewable: true,
    editable: true,

    copyable: true,

    multiline: true,
  },

  {
    key: "technological_solution",
    label: "Технологическое решение",
    viewable: true,
    editable: true,

    copyable: true,

    multiline: true,
  },
  {
    key: "repair_recommendation",
    label: "Решение / План устранения",
    viewable: true,
    editable: true,

    copyable: true,

    multiline: true,
  },
  {
    key: "materials_equipment",
    label: "Материалы и оборудование",
    viewable: true,
    editable: true,

    copyable: true,
    multiline: true,
  },
  {
    key: "note",
    label: "Примечание",
    viewable: true,
    editable: true,

    multiline: true,
    copyable: true,
  },

  // ===== ПАРАМЕТРЫ =====
  {
    key: "leak_speed",
    label: "Скорость утечки, л/мин",
    viewable: true,
    editable: true,

    copyable: true,
    numeric: true,
  },
  {
    key: "temperature",
    label: "Температура, °C",
    viewable: true,
    editable: true,

    copyable: true,
    numeric: true,
  },
  {
    key: "pressure",
    label: "Давление, атм",
    viewable: true,
    editable: true,

    copyable: true,
    numeric: true,
  },

  // ===== КООРДИНАТЫ =====
  {
    key: "lat",
    label: "Координата Х",
    viewable: true,
    editable: true,
  },
  {
    key: "lng",
    label: "Координата Y",
    viewable: true,
    editable: true,
  },
];

// Фильтры для удобства (опционально, для обратной совместимости)
export const VIEW_FIELDS = FIELDS.filter((f) => f.viewable);
export const EDIT_FIELDS = FIELDS.filter((f) => f.editable);
export const COPY_FIELDS = FIELDS.filter((f) => f.copyable);
export const NUMBER_FIELDS = FIELDS.filter((f) => f.numeric);
