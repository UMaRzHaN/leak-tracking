import { useLeaksMap } from "../../hooks/useLeaksMap";
import s from "./LeaksMap.module.scss";

export default function LeaksMap({ leaks, mapApiRef, onClick }) {
  const { mapRef, locateMe } = useLeaksMap({ leaks, mapApiRef });

  return (
    <div className={s.mapWrapper}>
      <div ref={mapRef} className={s.mapCanvas} />

      <button
        type="button"
        className={`${s.fab} ${s.fabSearch}`}
        onClick={onClick}
      >
        🔍
      </button>

      <button
        type="button"
        className={`${s.fab} ${s.fabLocate}`}
        onClick={locateMe}
      >
        📍
      </button>
    </div>
  );
}
  