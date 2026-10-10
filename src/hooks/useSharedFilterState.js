import { useState } from "react";
import { fromEntries } from "@/utils/fromEntries";

/**
 * Фильтры экрана: из общих фильтров приложения, если экран их получил, иначе —
 * собственное состояние экрана.
 *
 * База и карта держали так по восемь фильтров, и каждый — тремя-пятью
 * одинаковыми строками. Здесь фильтры описываются таблицей
 * `{ значение: [сеттер, начальное, bySetter?] }`, объявленной вне компонента:
 * набор ключей обязан быть одним и тем же на каждом рендере.
 *
 * Способов выбрать два:
 * - по умолчанию значение и сеттер выбираются порознь: значение — общее, если
 *   оно задано, сеттер — общий, если он есть;
 * - `bySetter` — оба берутся из общих фильтров, только когда там есть сеттер.
 *   Так устроены фильтры по месту: их «не выбрано» — это `null`, и при общем
 *   сеттере пустое общее значение не должно подменяться своим.
 *
 * @param {Record<string, any>|null|undefined} shared
 * @param {Record<string, [string, any, boolean?]>} specs
 * @returns {Record<string, any>} значения и сеттеры под их именами из таблицы
 */
export function useSharedFilterStates(shared, specs) {
  const [locals, setLocals] = useState(() =>
    fromEntries(
      Object.entries(specs).map(([key, [, initial]]) => [key, initial]),
    ),
  );
  // Свои сеттеры заводятся один раз: на них ссылаются useCallback и эффекты,
  // и новая функция на каждом рендере перезапускала бы их без причины.
  const [localSetters] = useState(() =>
    fromEntries(
      Object.keys(specs).map((key) => [
        key,
        (next) =>
          setLocals((current) => ({
            ...current,
            [key]: typeof next === "function" ? next(current[key]) : next,
          })),
      ]),
    ),
  );

  const result = {};
  for (const [key, [setterKey, , bySetter]] of Object.entries(specs)) {
    const sharedSetter = shared?.[setterKey];
    if (bySetter) {
      const useShared = typeof sharedSetter === "function";
      result[key] = useShared ? (shared?.[key] ?? null) : locals[key];
      result[setterKey] = useShared ? sharedSetter : localSetters[key];
    } else {
      result[key] = shared?.[key] ?? locals[key];
      result[setterKey] = sharedSetter ?? localSetters[key];
    }
  }
  return result;
}
