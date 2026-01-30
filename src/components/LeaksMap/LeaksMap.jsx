import { useLeaksMap } from "../../hooks/useLeaksMap";
import s from "./LeaksMap.module.scss";

export default function LeaksMap({
  leaks,
  mapApiRef,
  onSearchClick,
  onMoveEnd,
  coords,
}) {
  const { mapRef, locateMe } = useLeaksMap({
    leaks,
    mapApiRef,
    onMoveEnd,
    coords,
  });

  return (
    <div className={s.mapWrapper}>
      {/* <div ref={mapRef} className={s.mapCanvas} /> */}
      <div className="text" style={{ padding: 10 }}>
        Google Maps
        <br />
        <br />В данный момент доступен только её экспорт, для этого нажмите на
        поиск в правом нижнем углу экрана
        <br />
        <br />
        Ожидайте нововведения в следующих обновлениях
      </div>
      <button
        type="button"
        className={`${s.fab} ${s.fabSearch}`}
        onClick={onSearchClick}
        aria-label="Search leaks"
        style={{ bottom: 10 }}
      >
        🔍
      </button>

      {/* <button
        type="button"
        className={`${s.fab} ${s.fabLocate}`}
        onClick={locateMe}
        aria-label="Locate me"
      >
        📍
      </button> */}
    </div>
  );
}
