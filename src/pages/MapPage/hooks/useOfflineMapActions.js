import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguage } from "@/app/hooks/useLanguage";

export function useOfflineMapActions({ mapRef, notify }) {
  const { t } = useLanguage();
  const [tileProgress, setTileProgress] = useState(/** @type {any} */ (null));
  const [downloading, setDownloading] = useState(false);
  const abortControllerRef = useRef(/** @type {AbortController|null} */ (null));
  const progressTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined),
  );

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      clearTimeout(progressTimerRef.current);
    },
    [],
  );

  const cancelDownload = useCallback(() => {
    const controller = abortControllerRef.current;
    if (!controller) return;
    controller.abort(new DOMException("Cancelled by user", "AbortError"));
    abortControllerRef.current = null;
    setDownloading(false);
    setTileProgress((current) => ({
      done: current?.done ?? 0,
      total: current?.total ?? 0,
      status: "cancelled",
      stats: current?.stats,
    }));
    clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => setTileProgress(null), 2500);
  }, []);

  const handleDownloadArea = useCallback(async () => {
    const map = mapRef.current.map;
    if (!map || downloading) return;

    setDownloading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    clearTimeout(progressTimerRef.current);
    try {
      const { preloadUrls, buildViewportTileUrls } =
        await import("@/services/maps/tileCache");
      const urlSet = new Set();
      // Download exactly the viewport requested by the user. Expanding this to
      // every leak coordinate disclosed the complete project geography to the
      // configured third-party tile provider.
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
        notify("error", t("map.noTilesToDownload"));
        return;
      }

      setTileProgress({ done: 0, total: urls.length, status: null });
      const stats = await preloadUrls(urls, {
        signal: controller.signal,
        onProgress: (done, total) =>
          !controller.signal.aborted &&
          setTileProgress({ done, total, status: null }),
      });
      if (controller.signal.aborted) return;
      const hasAvailableTiles = stats.saved > 0 || stats.alreadyCached > 0;
      setTileProgress({
        done: urls.length,
        total: urls.length,
        status: hasAvailableTiles ? "success" : "error",
        stats,
      });
    } catch {
      if (controller.signal.aborted) return;
      setTileProgress({ done: 0, total: 0, status: "error" });
    } finally {
      if (
        abortControllerRef.current === controller &&
        !controller.signal.aborted
      ) {
        abortControllerRef.current = null;
        setDownloading(false);
        progressTimerRef.current = setTimeout(
          () => setTileProgress(null),
          2500,
        );
      }
    }
  }, [downloading, notify, mapRef, t]);

  return { tileProgress, downloading, handleDownloadArea, cancelDownload };
}
