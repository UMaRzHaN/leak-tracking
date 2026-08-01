import { useCallback, useState } from "react";

export function useOfflineMapActions({ mapRef, markerLeaks, notify, lang }) {
  const [tileProgress, setTileProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadArea = useCallback(async () => {
    const map = mapRef.current.map;
    if (!map || downloading) return;

    setDownloading(true);
    try {
      const { preloadUrls, buildTileUrls, buildViewportTileUrls } =
        await import("@/services/maps/tileCache");
      const urlSet = new Set();
      const validLeaks = markerLeaks.filter(
        (leak) => Number.isFinite(leak.lat) && Number.isFinite(leak.lng),
      );
      const zoomFactor = 2 ** 14;
      const seen = new Set();
      const uniqueLeaks = validLeaks.filter(({ lat, lng }) => {
        const tileX = Math.floor(((lng + 180) / 360) * zoomFactor);
        const latRad = (lat * Math.PI) / 180;
        const tileY = Math.floor(
          ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
            2) *
            zoomFactor,
        );
        const key = `${tileX}:${tileY}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const point of uniqueLeaks) {
        for (const url of buildTileUrls(point.lat, point.lng, 13, 13)) {
          urlSet.add(url);
        }
      }

      const bounds = map.getBounds();
      for (const url of buildViewportTileUrls(
        {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        Math.floor(map.getZoom()),
        Math.floor(map.getZoom()),
      )) {
        urlSet.add(url);
      }

      const urls = [...urlSet];
      if (urls.length === 0) {
        notify(
          "error",
          lang === "ru" ? "Нет тайлов для скачивания" : "No tiles to download",
        );
        return;
      }

      setTileProgress({ done: 0, total: urls.length, status: null });
      const stats = await preloadUrls(urls, {
        onProgress: (done, total) =>
          setTileProgress({ done, total, status: null }),
      });
      const hasAvailableTiles = stats.saved > 0 || stats.alreadyCached > 0;
      setTileProgress({
        done: urls.length,
        total: urls.length,
        status: hasAvailableTiles ? "success" : "error",
        stats,
      });
    } catch {
      setTileProgress({ done: 0, total: 0, status: "error" });
    } finally {
      setDownloading(false);
      setTimeout(() => setTileProgress(null), 2500);
    }
  }, [downloading, markerLeaks, notify, lang, mapRef]);

  return { tileProgress, downloading, handleDownloadArea };
}
