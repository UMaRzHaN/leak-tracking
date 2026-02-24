import { useState, useEffect } from "react";
import { useLeaksMap } from "../../hooks/useLeaksMap";
import s from "./LeaksMap.module.scss";

export default function LeaksMap({
  leaks,
  mapApiRef,
  onSearchClick,
  onMoveEnd,
  coords,
}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const { mapRef, locateMe } = useLeaksMap({
    leaks,
    mapApiRef,
    onMoveEnd,
    coords,
  });

  if (!isOnline) {
    return (
      <div className={s.mapWrapper}>
        <div className={s.offlineMessage}>
          Нет подключения к интернету. Подключитесь к интернету для просмотра
          карты. В данный момент доступен только её экспорт, для этого нажмите
          на поиск в правом нижнем углу экрана
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
      </div>
    );
  }

  return (
    <div className={s.mapWrapper}>
      <div ref={mapRef} className={s.mapCanvas} />
      {/* <div className="text" style={{ padding: 10 }}>
        Google Maps
        <br />
        <br />В данный момент доступен только её экспорт, для этого нажмите на
        поиск в правом нижнем углу экрана
        <br />
        <br />
        Ожидайте нововведения в следующих обновлениях
      </div> */}
      <button
        type="button"
        className={`${s.fab} ${s.fabSearch}`}
        onClick={onSearchClick}
        aria-label="Search leaks"
        // style={{ bottom: 10 }}
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
