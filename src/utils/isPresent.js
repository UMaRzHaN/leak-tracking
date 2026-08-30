/**
 * Есть ли значение — с сужением типа.
 *
 * `filter(Boolean)` отсеивает то же самое, но проверке типов об этом не
 * говорит: результат остаётся «возможно, пустым», и дальше приходится либо
 * проверять ещё раз, либо приводить. Предикат делает обещание фильтра видимым.
 *
 * @template T
 * @param {T|null|undefined} value
 * @returns {value is T}
 */
export function isPresent(value) {
  return value != null;
}
