import { fromEntries } from "@/utils/fromEntries";

/**
 * Поля, по которым спорить не о чем: свои у утечки и у записи обхода.
 *
 * Пути снимков отсеиваются потому, что после ввоза архива тот же снимок лежит
 * по другому пути, и сравнение путей объявляло бы расхождением каждую запись
 * со снимком. У записи обхода к ним добавляется `previousPhoto`, которого у
 * утечки нет, — этим списки и различаются.
 */
const SHARED_IGNORED_KEYS = [
  "id",
  "index",
  "photo",
  "photo_after",
  "photo_repair",
];

export const LEAK_SYNC_IGNORED_KEYS = new Set(SHARED_IGNORED_KEYS);

export const RECORD_SYNC_IGNORED_KEYS = new Set([
  ...SHARED_IGNORED_KEYS,
  "previousPhoto",
]);

/**
 * Сравнимый вид значения: без порядка ключей, без порядка элементов и без
 * полей, по которым спорить не о чем.
 *
 * Нужен, чтобы отличить настоящее расхождение от переставленных ключей. Пути
 * снимков отсеиваются: после ввоза архива один и тот же снимок лежит по
 * другому пути, и сравнение путей объявляло бы конфликтом каждую запись со
 * снимком.
 *
 * Список отсева передаётся, а не зашит: у записи обхода есть ещё
 * `previousPhoto`, которого у утечки нет. Раньше и функция, и список жили в
 * двух модулях по копии — одинаковые до строчки, кроме этого поля.
 */
export function normalizeSyncConflictValue(value, ignoredKeys) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeSyncConflictValue(item, ignoredKeys))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === "object") {
    return fromEntries(
      Object.keys(value)
        .filter((key) => !ignoredKeys.has(key))
        .sort()
        .map((key) => [
          key,
          normalizeSyncConflictValue(value[key], ignoredKeys),
        ]),
    );
  }
  return value;
}

/**
 * Сравнимая строка для значения поля.
 *
 * Порядок разрядов не случаен: отсутствие поля идёт раньше `undefined`, а тот
 * — раньше любого значения. Так две стороны обмена, у которых поле в разном
 * состоянии, приходят к одному решению независимо от того, кто из них
 * спрашивает.
 */
export function stableSyncValue(hasValue, value, ignoredKeys) {
  if (!hasValue) return "0:deleted";
  if (value === undefined) return "1:undefined";
  return `2:${JSON.stringify(normalizeSyncConflictValue(value, ignoredKeys))}`;
}
