import { useEffect, useRef, useState } from "react";
import { updateMarkers, autoCenterMap } from "../services/mapService";

export const useLeaksMap = ({ leaks, mapApiRef }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  /* ===== INIT MAP ===== */
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapRef.current) return;

      while (!window.google || !window.google.maps) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const { Map } = await window.google.maps.importLibrary("maps");
      if (cancelled) return;

      mapInstance.current = new Map(mapRef.current, {
        center: { lat: 41.3111, lng: 69.2797 },
        zoom: 12,
        mapTypeId: "hybrid",
        mapId: "f1754e62f5aea817edc5ba25",
        fullscreenControl: false,
        rotateControl: false, // ⬅️ ВОТ ОНА
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_TOP,
        },
        streetViewControl: false,
        mapTypeControl: false,
      });

      mapApiRef.current = {
        focus(leak) {
          mapInstance.current.panTo({
            lat: Number(leak.lat),
            lng: Number(leak.lon),
          });
          mapInstance.current.setZoom(14);
        },
      };

      setMapReady(true);
    }

    initMap();
    return () => {
      cancelled = true;
    };
  }, [mapApiRef]);

  /* ===== MARKERS + CENTER ===== */
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;

    updateMarkers({
      map: mapInstance.current,
      leaks,
      markersRef,
      clustererRef,
    });

    autoCenterMap({
      map: mapInstance.current,
      leaks,
    });
  }, [mapReady, leaks]);

  return { mapRef };
};
