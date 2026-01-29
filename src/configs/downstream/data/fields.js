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
    key: "district",
    label: "Район",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "locality",
    label: "Населенный пункт",
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "address",
    label: "Адрес",
    viewable: true,
    editable: true,
    copyable: true,
  },

  // ===== ОБЪЕКТ =====
  {
    key: "object",
    label: "Объект",
    viewable: true,
    editable: true,
    copyable: true,
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
    editable: true,
    copyable: true,
  },
  {
    key: "connection_type",
    label: "Тип присоединения",
    multiline: true,
    viewable: true,
    editable: true,
    copyable: true,
  },
  {
    key: "installation_type",
    label: "Тип установки",
    multiline: true,
    viewable: true,
    editable: true,
    copyable: true,
  },

  // ===== КАТЕГОРИЯ =====
  {
    key: "category",
    label: "Категория",
    viewable: true,
    editable: true,
    copyable: true,
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
    key: "technological_solution",
    label: "Технологическое решение",
    viewable: true,
    editable: true,

    multiline: true,
    copyable: true,
  },
  {
    key: "repair_recommendation",
    label: "Решение / План устранения",
    viewable: true,
    editable: true,

    multiline: true,
    copyable: true,
  },
  {
    key: "materials_equipment",
    label: "Материалы и оборудование",
    viewable: true,
    editable: true,

    multiline: true,
    copyable: true,
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

    numeric: true,
  },
  {
    key: "temperature",
    label: "Температура, °C",
    viewable: true,
    editable: true,

    numeric: true,
    copyable: true,
  },
  {
    key: "pressure",
    label: "Давление, атм",
    viewable: true,
    editable: true,

    numeric: true,

    copyable: true,
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
