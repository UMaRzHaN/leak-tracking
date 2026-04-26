import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MobileSheet from "../../components/MobileSheet/MobileSheet";
import Notification from "../../components/Notification/Notification";
import { getDistanceMeters } from "../../utils/geoUtils";
import { useActiveLocation } from "../../hooks/useActiveLocation";
import { useProject } from "../../app/settings/ProjectContext";
import { getProjectMobileDir } from "../../app/settings/storageKeys";
import { createOfflineMap, addMarkers } from "../../services/maps/offlineMap";
import { preloadUrls, buildTileUrls, buildViewportTileUrls } from "../../services/maps/tileCache";
import { saveLeaksKML } from "../../services/export/kml";
import { handleExport } from "../../utils/handleExport";
import s from "./MapPage.module.scss";


export default function MapPage({ leaks, coords }) {
  const { activeProject } = useProject();
  const mkdir = getProjectMobileDir(activeProject);

  const mapApiRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef({ map: null, markersLayer: null, locateMe: null, destroy: null });
  const fittedRef = useRef(false);

  const { leaks: normalizedLeaks, locations, label: locationLabel } = useActiveLocation(leaks);

  const [mapCenter, setMapCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [enabledLocations, setEnabledLocations] = useState({});
  const [notification, setNotification] = useState(null);
  const [tileProgress, setTileProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const notify = useCallback((type, message) => setNotification({ type, message }), []);

  useEffect(() => {
    setEnabledLocations((prev) => {
      const next = {};
      locations.forEach((loc) => { next[loc] = prev[loc] ?? true; });
      return next;
    });
  }, [locations]);

  const toggleLocation = useCallback((location) => {
    setEnabledLocations((prev) => ({ ...prev, [location]: !prev[location] }));
  }, []);

  const visibleLeaks = useMemo(() => {
    const filtered = normalizedLeaks.filter((l) => enabledLocations[l._location]);
    if (!mapCenter) return filtered;
    return filtered
      .map((l) => ({
        ...l,
        _distance: getDistanceMeters(mapCenter.lat, mapCenter.lng, l.lat, l.lng),
      }))
      .sort((a, b) => a._distance - b._distance);
  }, [normalizedLeaks, enabledLocations, mapCenter]);

  /* ── Инициализация карты ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current.map) return;

    const fallbackCenter =
      Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
        ? [coords.lat, coords.lng]
        : [41.3111, 69.2797];

    const { map, markersLayer, locateMe, destroy } = createOfflineMap(container, {
      center: fallbackCenter,
      zoom: 13,
    });

    mapRef.current = { map, markersLayer, locateMe, destroy };

    map.on("moveend", () => {
      const c = map.getCenter();
      setMapCenter({ lat: c.lat, lng: c.lng });
    });

    mapApiRef.current = {
      focus: (leak) => {
        if (!Number.isFinite(leak?.lat) || !Number.isFinite(leak?.lng)) return;
        map.setView([leak.lat, leak.lng], 16, { animate: true });
      },
    };

    return () => {
      mapRef.current.map?.off("moveend");
      destroy();
      fittedRef.current = false;
      mapRef.current = { map: null, markersLayer: null, locateMe: null, destroy: null };
      mapApiRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Обновление маркеров + первичный fitBounds ── */
  useEffect(() => {
    addMarkers(mapRef.current.markersLayer, visibleLeaks);

    if (fittedRef.current) return;
    const map = mapRef.current.map;
    if (!map) return;

    const valid = visibleLeaks.filter(
      (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
    );
    if (valid.length === 0) return;

    fittedRef.current = true;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 15, { animate: false });
    } else {
      map.fitBounds(valid.map((l) => [l.lat, l.lng]), { padding: [40, 40], maxZoom: 16, animate: false });
    }
  }, [visibleLeaks]);


  /* ── Скачать тайлы: вокруг всех утечек + текущий viewport ── */
  const handleDownloadArea = useCallback(async () => {
    const map = mapRef.current.map;
    if (!map || downloading) return;

    setDownloading(true);
    try {
      const urlSet = new Set();

      const valid = visibleLeaks.filter(
        (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng),
      );
      const n = 2 ** 14;
      const seen = new Set();
      const unique = valid.filter(({ lat, lng }) => {
        const tx = Math.floor(((lng + 180) / 360) * n);
        const latRad = (lat * Math.PI) / 180;
        const ty = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
        const key = `${tx}:${ty}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const pt of unique) {
        for (const url of buildTileUrls(pt.lat, pt.lng, 13, 13)) urlSet.add(url);
      }

      const b = map.getBounds();
      const bounds = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
      const currentZoom = Math.floor(map.getZoom());
      for (const url of buildViewportTileUrls(bounds, currentZoom, currentZoom)) urlSet.add(url);

      const urls = [...urlSet];
      if (urls.length === 0) {
        notify("error", "Нет тайлов для скачивания");
        return;
      }

      setTileProgress({ done: 0, total: urls.length, status: null });
      await preloadUrls(urls, {
        onProgress: (done, total) => setTileProgress({ done, total, status: null }),
      });
      setTileProgress({ done: urls.length, total: urls.length, status: "success" });
    } catch {
      setTileProgress({ done: 0, total: 0, status: "error" });
    } finally {
      setDownloading(false);
      setTimeout(() => setTileProgress(null), 2500);
    }
  }, [downloading, visibleLeaks]);

  /* ── Экспорт KML ── */
  const handleExportKML = useCallback(() => {
    handleExport({
      leaks: visibleLeaks,
      saveFn: () => saveLeaksKML(visibleLeaks, activeProject?.type, mkdir),
      onSuccess: (result) =>
        notify("success", result?.message || "KML-файл успешно экспортирован"),
      onError: (message) => notify("error", message),
    });
  }, [visibleLeaks, activeProject, mkdir, notify]);

  return (
    <div className={s.mapWrapper}>
      <Notification notification={notification} onClose={() => setNotification(null)} />

      {/* Leaflet контейнер */}
      <div ref={containerRef} className={s.mapCanvas} />

      {/* Панель управления */}
      <div className={s.controls}>
        <button
          type="button"
          className={s.controlBtn}
          onClick={() => mapRef.current.locateMe?.()}
          aria-label="Моё местоположение"
        >
          <svg className={s.controlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="2" x2="12" y2="6"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="6" y2="12"/>
            <line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
        <button
          type="button"
          className={s.controlBtn}
          onClick={() => setOpen(true)}
          aria-label="Поиск утечек"
        >
          <svg className={s.controlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
        </button>
        <button
          type="button"
          className={`${s.controlBtn} ${downloading ? s.controlBtnActive : ""}`}
          onClick={handleDownloadArea}
          disabled={downloading}
          aria-label="Скачать карту текущей области"
        >
          <svg className={s.controlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v13M7 11l5 5 5-5"/>
            <path d="M3 19h18"/>
          </svg>
        </button>
      </div>

      {/* Кнопки экспорта */}
      {activeProject && visibleLeaks.length > 0 && (
        <div className={s.exportGroup}>
          <button
            type="button"
            className={s.exportBtn}
            onClick={handleExportKML}
          >
            ↗ KML
          </button>
        </div>
      )}


      {tileProgress && (
        <div className={`${s.tileProgress} ${tileProgress.status ? s[`tileProgress_${tileProgress.status}`] : ""}`}>
          {!tileProgress.status && (
            <div
              className={s.tileProgressBar}
              style={{ width: `${Math.round((tileProgress.done / tileProgress.total) * 100)}%` }}
            />
          )}
          <span className={s.tileProgressLabel}>
            {tileProgress.status === "success"
              ? `✓ Сохранено ${tileProgress.total} тайлов`
              : tileProgress.status === "error"
              ? "✕ Ошибка скачивания"
              : `Загрузка ${Math.round((tileProgress.done / tileProgress.total) * 100)}%`}
          </span>
        </div>
      )}

      <MobileSheet
        open={open}
        leaks={visibleLeaks}
        locations={locations}
        locationLabel={locationLabel}
        enabledLocations={enabledLocations}
        onToggleLocation={toggleLocation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          mapApiRef.current?.focus?.(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}
