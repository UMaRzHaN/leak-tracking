import { normalizeLocationValue } from "@/utils/locationFilter";

/**
 * Объекты проекта для «Объектов и кустов» (11c): последний уровень места,
 * путь над ним и число записей. Запись без объекта никуда не попадает —
 * объекта у неё нет.
 *
 * @param {any[]} records
 * @param {string[]} levelKeys
 */
export function listProjectObjects(records, levelKeys) {
  if (!levelKeys?.length) return [];
  const last = levelKeys[levelKeys.length - 1];
  const parents = levelKeys.slice(0, -1);
  const objects = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const name = normalizeLocationValue(record?.[last]);
    if (!name) continue;
    const pathParts = parents
      .map((key) => normalizeLocationValue(record?.[key]))
      .filter(Boolean);
    const key = JSON.stringify([...pathParts, name]);
    const entry = objects.get(key);
    if (entry) entry.count += 1;
    else objects.set(key, { key, name, path: pathParts.join(" › "), count: 1 });
  }
  return [...objects.values()];
}
