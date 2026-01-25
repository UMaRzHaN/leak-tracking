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
      <div ref={mapRef} className={s.mapCanvas} />

      <button
        type="button"
        className={`${s.fab} ${s.fabSearch}`}
        onClick={onSearchClick}
        aria-label="Search leaks"
      >
        🔍
      </button>

      <button
        type="button"
        className={`${s.fab} ${s.fabLocate}`}
        onClick={locateMe}
        aria-label="Locate me"
      >
        📍
      </button>
    </div>
  );
}
