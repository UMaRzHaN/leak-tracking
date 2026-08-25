const EMPTY_VALUES = new Set([null, undefined, ""]);

function isEmpty(value) {
  return EMPTY_VALUES.has(value);
}

function comparableValue(value) {
  if (isEmpty(value)) return "";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return String(value).trim();
}

function serializeValue(value) {
  if (isEmpty(value)) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  return "[changed]";
}

function addValueChange(changes, before, after, key) {
  if (comparableValue(before[key]) === comparableValue(after[key])) return;

  changes.push({
    key,
    from: serializeValue(before[key]),
    to: serializeValue(after[key]),
  });
}

function addPhotoChange(changes, before, after, key) {
  const from = Boolean(before[key]);
  const to = Boolean(after[key]);

  if (from === to && before[key] === after[key]) return;

  changes.push({
    key,
    kind: "photo",
    from,
    to,
  });
}

/**
 * Одна запись в истории изменений утечки.
 *
 * @typedef {{
 *   key: string,
 *   kind?: "photo",
 *   from?: string | number | boolean | null,
 *   to?: string | number | boolean | null,
 * }} LeakHistoryChange
 */

/**
 * Сравнивает две версии записи и возвращает список того, что изменилось.
 *
 * Аннотации здесь не косметика: без них `fields = []` выводится как `never[]`,
 * и под strictNullChecks на этом падали девять мест вызова в domain/ и utils/ —
 * при том что ошибка была ровно одна, здесь.
 *
 * @param {object} params
 * @param {Record<string, any>} params.before
 * @param {Record<string, any>} params.after
 * @param {{key: string}[]} [params.fields] поля конфигурации проекта
 * @param {string[]} [params.includeKeys] ключи, которых нет в конфигурации
 * @returns {LeakHistoryChange[]}
 */
export function buildLeakHistoryChanges({
  before,
  after,
  fields = [],
  includeKeys = [],
}) {
  /** @type {LeakHistoryChange[]} */
  const changes = [];
  const keys = new Set([
    ...fields.map((field) => field.key).filter(Boolean),
    ...includeKeys,
  ]);

  keys.forEach((key) => {
    if (key === "photo" || key === "photo_after" || key === "photo_repair") {
      addPhotoChange(changes, before, after, key);
      return;
    }

    addValueChange(changes, before, after, key);
  });

  return changes;
}
