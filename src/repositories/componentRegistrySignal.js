/**
 * Сигнал о том, что реестр компонентов изменился в хранилище.
 *
 * Список реестра держит один владелец на всё приложение
 * (`ComponentRegistryProvider`), и все его записи он делает сам — знать о них
 * из сигнала ему незачем. Но есть пути, идущие мимо: архив инвентаризации и
 * импорт проекта сводят карточки и пишут их прямо через репозиторий, из кода,
 * который ничего не знает ни про React, ни про то, открыт ли сейчас реестр.
 * Без сигнала владелец продолжал бы показывать список, прочитанный до импорта.
 *
 * Лежит в `repositories/`, потому что это единственный слой, который видят обе
 * стороны: и `services/`, где сводят карточки, и `features/`, где их
 * показывают. Само событие — окно, а не свой брокер: подписчик ровно один, и
 * заводить ради него отдельную шину дороже, чем она стоит.
 */

export const COMPONENT_REGISTRY_UPDATED = "component-registry-updated";

/** Зовётся после записи, сделанной **не** владельцем списка. */
export function notifyComponentRegistryChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPONENT_REGISTRY_UPDATED));
}

/** @param {() => void} listener @returns {() => void} отписка */
export function onComponentRegistryChanged(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(COMPONENT_REGISTRY_UPDATED, listener);
  return () => window.removeEventListener(COMPONENT_REGISTRY_UPDATED, listener);
}
