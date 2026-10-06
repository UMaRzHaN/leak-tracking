import { normalizeLocationValue } from "@/utils/locationFilter";

/**
 * Объекты проекта для «Объектов и кустов» (11c): последний уровень места,
 * все уровни над ним и число записей. Запись без объекта никуда не попадает —
 * объекта у неё нет.
 *
 * @param {any[]} records
 * @param {string[]} levelKeys
 * @returns {Array<{ key: string, name: string, parents: string[], path: string, count: number }>}
 */
export function listProjectObjects(records, levelKeys) {
  if (!levelKeys?.length) return [];
  const last = levelKeys[levelKeys.length - 1];
  const parentKeys = levelKeys.slice(0, -1);
  const objects = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const name = normalizeLocationValue(record?.[last]);
    if (!name) continue;
    // Пустой уровень остаётся пустым, а не выпадает: иначе объект без
    // месторождения оказался бы на уровне месторождений.
    const parents = parentKeys.map((key) =>
      normalizeLocationValue(record?.[key]),
    );
    const key = JSON.stringify([...parents, name]);
    const entry = objects.get(key);
    if (entry) entry.count += 1;
    else
      objects.set(key, {
        key,
        name,
        parents,
        path: parents.filter(Boolean).join(" › "),
        count: 1,
      });
  }
  return [...objects.values()];
}

/**
 * Уровень экрана объектов: что лежит под выбранным путём `trail`. Пока путь
 * короче числа уровней над объектами — папки следующего уровня со счётчиками
 * объектов и записей; когда дошли до конца — null, и экран показывает сами
 * объекты.
 *
 * @param {ReturnType<typeof listProjectObjects>} objects
 * @param {string[]} trail
 * @returns {Array<{ key: string, name: string, objects: number, count: number }>|null}
 */
export function projectObjectLevel(objects, trail) {
  const depth = objects[0]?.parents.length ?? 0;
  if (trail.length >= depth) return null;
  const groups = new Map();
  for (const object of objectsUnder(objects, trail)) {
    const name = object.parents[trail.length];
    const group = groups.get(name);
    if (group) {
      group.objects += 1;
      group.count += object.count;
    } else {
      groups.set(name, { key: name, name, objects: 1, count: object.count });
    }
  }
  return [...groups.values()];
}

/** Объекты под выбранным путём. */
export function objectsUnder(objects, trail) {
  return objects.filter((object) =>
    trail.every((value, index) => object.parents[index] === value),
  );
}
