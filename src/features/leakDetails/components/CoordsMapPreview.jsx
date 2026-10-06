import { useEffect, useRef } from "react";
import { logger } from "@/utils/logger";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * Снимок карты вокруг утечки во вкладке «Координаты» (5e): та же подложка,
 * что у основной карты, — со скачанными районами и подменой снимков, — только
 * неподвижная. Сетка под ней остаётся видна, пока тайлы грузятся или если их
 * нет вовсе (нет связи, район не скачан).
 *
 * Leaflet грузится здесь, при открытии вкладки: карточка утечки обходится
 * без карты, и тянуть её в каждую карточку незачем.
 */
export default function CoordsMapPreview({ lat, lng, color }) {
  const containerRef = useRef(/** @type {HTMLDivElement|null} */ (null));

  useEffect(() => {
    let map = /** @type {any} */ (null);
    let cancelled = false;

    (async () => {
      try {
        const [{ default: L }, { addBaseTileLayer }] = await Promise.all([
          import("leaflet"),
          import("@/pages/MapPage/cachedTileLayer"),
          import("leaflet/dist/leaflet.css"),
        ]);
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([lat, lng], 17);
        addBaseTileLayer(map);
      } catch (error) {
        logger.warn("[coordsPreview] map preview failed:", error);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <div className={s.coordsPreview} aria-hidden="true">
      <div ref={containerRef} className={s.coordsMap} />
      <span className={s.coordsPin} style={{ background: color }} />
    </div>
  );
}
