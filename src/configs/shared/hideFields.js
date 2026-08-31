import { PROTECTED_FIELD_KEYS } from "@/configs/shared/protectedFields";

/**
 * Убирает скрытые поля из шагов формы и из колонок выгрузки.
 *
 * Одно правило на две сущности: у утечки и у карточки компонента списки полей
 * свои, но прячут их одинаково — из формы и из книги разом, иначе в выгрузке
 * оставался бы столбец, которого человек на экране не видит.
 *
 * Защищённые поля не прячутся никогда: на них держится обработка данных, а не
 * показ. Поэтому фильтр берётся уже без них — набор, состоящий из одних только
 * защищённых, равносилен пустому.
 *
 * Шаг, у которого не осталось полей, уходит целиком: пустая страница мастера
 * выглядит поломкой.
 */
export function withoutProtected(hiddenFields) {
  return new Set(
    [...(hiddenFields ?? [])].filter((key) => !PROTECTED_FIELD_KEYS.has(key)),
  );
}

/** @param {{fields: {key: string}[]}[]} steps */
export function hideFieldsInSteps(steps, hidden) {
  if (!hidden.size) return steps;
  return steps
    .map((step) => ({
      ...step,
      fields: step.fields.filter((field) => !hidden.has(field.key)),
    }))
    .filter((step) => step.fields.length > 0);
}

/**
 * Заголовки и ключи идут двумя списками одной длины, поэтому режутся парами:
 * фильтровать их порознь значит однажды сдвинуть подписи относительно данных.
 *
 * @template {{headers: string[], keysOrder: string[]}} T
 * @param {T} excel
 * @returns {T}
 */
export function hideFieldsInExcel(excel, hidden) {
  if (!hidden.size) return excel;
  const kept = excel.keysOrder
    .map((key, index) => ({ key, header: excel.headers[index] }))
    .filter(({ key }) => !hidden.has(key));

  return {
    ...excel,
    headers: kept.map((pair) => pair.header),
    keysOrder: kept.map((pair) => pair.key),
  };
}
