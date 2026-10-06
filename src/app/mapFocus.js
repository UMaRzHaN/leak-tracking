import { globalScope } from "@/utils/globalScope";

/**
 * «Показать на карте» из карточки утечки (5e). Карточка живёт внутри
 * страницы и сама на карту не переходит: она оставляет точку здесь и зовёт
 * приложение, а карта, открывшись, забирает точку вместо того, чтобы
 * вписывать в кадр все утечки разом.
 */
export const SHOW_ON_MAP_EVENT = "app:show-on-map";

/** Зум точки: на ступень ближе родного разрешения спутника. */
export const MAP_FOCUS_ZOOM = 20;

let pending = /** @type {{lat:number, lng:number}|null} */ (null);

export function requestMapFocus(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  pending = { lat, lng };
  globalScope.dispatchEvent?.(new CustomEvent(SHOW_ON_MAP_EVENT));
}

/** Забирает точку один раз: следующий вход на карту снова покажет всё. */
export function takeMapFocus() {
  const point = pending;
  pending = null;
  return point;
}
