export const SYSTEM_FIELD_KEYS = Object.freeze([
  "index",
  "date",
  "detectedBy",
  "status",
  "resolvedAt",
  "monitoringRecords",
  "roundNumber",
]);

export const SYSTEM_FIELD_KEY_SET = new Set(SYSTEM_FIELD_KEYS);

/**
 * Поля, которые разбираются как числа при вводе.
 *
 * Список лежит здесь, а не выводится из определений полей, по той же причине,
 * по которой рядом лежит `SYSTEM_FIELD_KEYS`: его спрашивают из стартового
 * графа. Провайдер формы утечки живёт над всем приложением и ради этих семи
 * имён читал полный конфиг типа проекта — тридцать килобайт словарей и шагов
 * на первый экран.
 *
 * У всех трёх типов набор сегодня одинаков. Расхождение поймает
 * `fieldRegistry.test.js`: он сверяет этот список с тем, что объявляет каждый
 * конфиг, и падает, если тип завёл своё числовое поле, — тогда список
 * перестанет быть общим и решать придётся осознанно.
 */
export const NUMERIC_FIELD_KEYS = Object.freeze([
  "leak_id",
  "video_id",
  "leak_speed",
  "temperature",
  "pressure",
  "lat",
  "lng",
]);

export const NUMERIC_FIELD_KEY_SET = new Set(NUMERIC_FIELD_KEYS);

export function isSystemFieldKey(key) {
  return SYSTEM_FIELD_KEY_SET.has(key);
}

export function createFieldSets(fields) {
  const all = fields.map((field) => ({
    ...field,
    system: field.system ?? isSystemFieldKey(field.key),
  }));

  return {
    FIELDS: all,
    VIEW_FIELDS: all.filter((field) => field.viewable),
    EDIT_FIELDS: all.filter((field) => field.editable),
    COPY_FIELDS: all.filter((field) => field.copyable),
    NUMBER_FIELDS: all.filter((field) => field.numeric),
    VOICE_FIELDS: all.filter((field) => field.voice),
  };
}

export function getVoiceFieldKeys(fields) {
  return fields.filter((field) => field.voice).map((field) => field.key);
}
