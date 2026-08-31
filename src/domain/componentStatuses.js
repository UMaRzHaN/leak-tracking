import { component_statuses } from "@/data/component/componentDictionary";

/**
 * Какие состояния железа предлагать в отборе.
 *
 * Только те, что встречаются: список открытый — состояние можно вписать
 * руками, — и показывать все словарные значения там, где половины из них нет,
 * значит предлагать фильтры, дающие пустой список.
 *
 * Порядок словарный, а вписанные руками — за ними по алфавиту: у словарных он
 * осмысленный («в работе» раньше «демонтирован»), а у произвольных строк
 * осмысленного порядка нет.
 *
 * @param {Record<string, any>[]} components
 * @returns {string[]}
 */
export function usedComponentStatuses(components) {
  const seen = new Set();
  for (const component of components ?? []) {
    const status = String(component?.component_status ?? "").trim();
    if (status) seen.add(status);
  }

  return [
    ...component_statuses.filter((status) => seen.has(status)),
    ...[...seen]
      .filter((status) => !component_statuses.includes(status))
      .sort((left, right) => left.localeCompare(right)),
  ];
}
