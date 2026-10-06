import { useSyncExternalStore } from "react";

/**
 * Где человек сейчас — для мест, которым приложение позицию не передаёт:
 * карточка утечки открывается с трёх страниц, и тянуть координаты в каждую
 * ради строки «От вас» значило бы три одинаковых провода.
 *
 * Пишет одно место — состояние приложения, по тому же GPS, что и карта.
 * С выключенным GPS позиции нет: старая точка выдавала бы расстояние от
 * места, где человека давно нет.
 */
let current = /** @type {{lat:number, lng:number}|null} */ (null);
const listeners = new Set();

export function setCurrentPosition(coords) {
  const next =
    Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
      ? { lat: coords.lat, lng: coords.lng }
      : null;
  if (next?.lat === current?.lat && next?.lng === current?.lng) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentPosition() {
  return useSyncExternalStore(subscribe, () => current);
}
