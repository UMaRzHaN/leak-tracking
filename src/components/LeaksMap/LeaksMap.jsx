import { useState } from "react";
import { useLeaksMap } from "../../hooks/useLeaksMap";
import s from "./LeaksMap.module.scss";

export default function LeaksMap({ leaks, mapApiRef, onClick }) {
  const [selectedLeak, setSelectedLeak] = useState(null);
  const { mapRef, locateMe } = useLeaksMap({
    leaks: leaks,
    mapApiRef,
    onSelectLeak: (leak) => {
      setSelectedLeak(leak);
    },
  });
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
