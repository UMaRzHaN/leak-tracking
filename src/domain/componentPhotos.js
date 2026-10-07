import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";

/**
 * Снимки компонента: что показывать на карточке и что было до осмотра.
 *
 * Снимок сверки ложится в запись истории, а не на карточку — главный снимок
 * остаётся тем, с которым компонент заводили, и правится только в карточке.
 * Показывать же надо последнее, что о железе известно: человек, открывший
 * карточку после сверки, хочет видеть, как оно выглядит сейчас.
 */

function history(component) {
  return Array.isArray(component?.history) ? component.history : [];
}

function isInspection(entry) {
  return entry?.action === COMPONENT_HISTORY_ACTIONS.INSPECTED && entry.date;
}

/**
 * Снимок для карточки: последний снимок сверки, иначе главный.
 *
 * @param {any} component
 * @returns {string|null}
 */
export function getComponentDisplayPhoto(component) {
  const entries = history(component);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (isInspection(entry) && entry.photo) return String(entry.photo);
  }
  return component?.photo ? String(component.photo) : null;
}

/**
 * Лог сверок, новые сверху, — у каждого осмотра со снимком ещё и снимок «до»:
 * снимок прошлой сверки, а у первой — тот, с которым компонент заводили.
 * Так же, как «фото до обхода» у утечки, только считается при чтении: записи
 * сверок, сделанные раньше, получают пару без переписывания истории.
 *
 * @param {any} component
 * @returns {Array<Record<string, any>>}
 */
export function getComponentReconcileLog(component) {
  let previous = component?.photo ? String(component.photo) : null;
  const log = [];
  for (const entry of history(component)) {
    if (!isInspection(entry)) continue;
    const photo = entry.photo ? String(entry.photo) : null;
    log.push(
      photo && previous && previous !== photo
        ? { ...entry, previousPhoto: previous }
        : entry,
    );
    if (photo) previous = photo;
  }
  return log.reverse();
}
