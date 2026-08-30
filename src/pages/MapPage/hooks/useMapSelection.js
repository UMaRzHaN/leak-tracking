import { useCallback, useEffect, useRef, useState } from "react";

export function useMapSelection({ coords, gpsEnabled, mapRef }) {
  const mapApiRef = useRef(/** @type {any} */ (null));
  const latestCoordsRef = useRef(coords);
  const [mapCenter, setMapCenter] = useState(/** @type {any} */ (null));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    latestCoordsRef.current = coords;
  }, [coords]);

  const focusLeak = useCallback((leak, zoom) => {
    mapApiRef.current?.focus?.(leak, zoom);
  }, []);

  const locateMe = useCallback(() => {
    if (!gpsEnabled) return;
    mapRef.current.locateMe?.(latestCoordsRef.current);
  }, [gpsEnabled, mapRef]);

  return {
    mapApiRef,
    latestCoordsRef,
    mapCenter,
    setMapCenter,
    open,
    setOpen,
    focusLeak,
    locateMe,
  };
}
