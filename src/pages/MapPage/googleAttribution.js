import { fetchGoogleCopyright } from "@/services/maps/googleTiles";
import { escapeHtml } from "./kmlText";

const REFRESH_DELAY_MS = 500;

/**
 * Пока на карте есть хоть один тайл Google, условия требуют подписи
 * «Google» и строки правообладателей видимой области. Подпись появляется
 * с первым таким тайлом и обновляется после каждого сдвига карты.
 * @param {any} map карта Leaflet
 * @param {any} layer слой, который сообщает о показе тайла Google событием googletile
 * @returns {() => void} отцепить подпись: снять подписки и отложенное обновление.
 *   Вызывать до map.off()/map.remove() — иначе таймер переживёт карту.
 */
export function attachGoogleAttribution(map, layer) {
  let active = false;
  let detached = false;
  let current = "";
  let timer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (
    undefined
  );

  const show = (copyright) => {
    if (detached) return;
    const control = map.attributionControl;
    if (!control) return;
    if (current) control.removeAttribution(current);
    current = copyright
      ? `Google · ${escapeHtml(copyright)}`
      : "Imagery &copy; Google";
    control.addAttribution(current);
  };

  const refresh = async () => {
    // Таймер или ответ Google пришли после удаления карты: у неё уже нет
    // ни границ, ни подписи, и getBounds бросал бы.
    if (detached) return;
    const bounds = map.getBounds();
    const copyright = await fetchGoogleCopyright(
      {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
      Math.round(map.getZoom()),
    );
    if (copyright !== null) show(copyright);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, REFRESH_DELAY_MS);
  };

  const onGoogleTile = () => {
    if (active || detached) return;
    active = true;
    show("");
    refresh();
    map.on("moveend", schedule);
  };

  /*
   * Раньше таймер снимался только по unload карты, а offlineMap перед
   * map.remove() делает map.off() — подписка на unload пропадала, и
   * отложенное обновление билось о удалённую карту.
   */
  const detach = () => {
    if (detached) return;
    detached = true;
    clearTimeout(timer);
    layer.off?.("googletile", onGoogleTile);
    map.off?.("moveend", schedule);
    map.off?.("unload", detach);
  };

  layer.on("googletile", onGoogleTile);
  map.on("unload", detach);
  return detach;
}
