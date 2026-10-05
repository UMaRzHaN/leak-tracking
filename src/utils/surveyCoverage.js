import { normalizeLocationValue } from "@/utils/locationFilter";

/**
 * Охват обследования по тому, что уже есть в проекте.
 *
 * Объект — последний уровень места (скважина, станция, адрес) вместе со всем
 * путём над ним: «Скважина 2» на двух месторождениях — два разных объекта.
 * Обследованным считается объект, где есть хоть одна запись об утечке. Всего
 * объектов — сколько их знает реестр компонентов вместе с теми, что
 * встречаются только в утечках.
 *
 * Это нижняя граница охвата: объект, осмотренный без находок, утечки не
 * оставляет. Точный счёт даст ввод «Обследовано без утечек» (макеты 4a–4c);
 * до него без реестра знаменателя нет вовсе, и `total` равен `null` — делить
 * объекты с утечками на них же и показывать 100 % было бы враньём.
 *
 * @param {{ leaks?: any[], components?: any[], levelKeys: string[] }} input
 * @returns {{ surveyed: number, total: number|null, percent: number|null }}
 */
export function computeSurveyCoverage({
  leaks = [],
  components = [],
  levelKeys,
}) {
  const surveyed = objectKeys(leaks, levelKeys);
  if (!components.length) {
    return { surveyed: surveyed.size, total: null, percent: null };
  }
  const all = new Set([...objectKeys(components, levelKeys), ...surveyed]);
  return {
    surveyed: surveyed.size,
    total: all.size,
    percent: all.size ? Math.round((surveyed.size / all.size) * 100) : 0,
  };
}

function objectKeys(records, levelKeys) {
  const keys = new Set();
  if (!levelKeys?.length) return keys;
  const last = levelKeys[levelKeys.length - 1];
  for (const record of records) {
    // Запись без объекта не говорит, какой объект осмотрен.
    if (!normalizeLocationValue(record?.[last])) continue;
    keys.add(
      JSON.stringify(
        levelKeys.map((key) => normalizeLocationValue(record?.[key])),
      ),
    );
  }
  return keys;
}
