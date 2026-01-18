import { useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

/* ===== helpers ===== */

function getColorByStatus(status) {
  if (status === "Fixed") return "#4CAF50";
  if (status === "Active") return "#F44336";
  return "#FBC02D";
}

function createMarkerContent(color, label) {
  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.borderRadius = "50%";
  el.style.background = color;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.color = "#fff";
  el.style.fontSize = "13px";
  el.style.fontWeight = "600";
  el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
  el.style.transform = "translateY(-14px)";
  el.textContent = label;
  return el;
}

/* ===== component ===== */

export default function LeaksMap({ leaks, mapApiRef }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!window.google || !mapRef.current) return;

      const { Map } = await window.google.maps.importLibrary("maps");
      if (cancelled) return;

      mapInstance.current = new Map(mapRef.current, {
        center: { lat: 41.3111, lng: 69.2797 },
        zoom: 10,
        mapTypeId: "hybrid",
        mapId: "f1754e62f5aea817edc5ba25",
        mapTypeControl: false,
        zoomControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapApiRef.current = {
        focus(leak) {
          mapInstance.current.panTo({
            lat: Number(leak.lat),
            lng: Number(leak.lon),
          });
          mapInstance.current.setZoom(10);
        },
      };

      setMapReady(true);
    }

    initMap();
    return () => {
      cancelled = true;
    };
  }, [mapApiRef]);
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;

    async function updateMarkers() {
      const { AdvancedMarkerElement } = await window.google.maps.importLibrary(
        "marker"
      );

      // очистка
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];

      leaks.forEach((leak) => {
        if (leak?.lat == null || leak?.lon == null) return;

        const marker = new AdvancedMarkerElement({
          map: mapInstance.current,
          position: {
            lat: Number(leak.lat),
            lng: Number(leak.lon),
          },
          content: createMarkerContent(
            getColorByStatus(leak.status),
            leak.leak_id
          ),
        });

        markersRef.current.push(marker);
      });

      clustererRef.current?.clearMarkers();
      clustererRef.current = new MarkerClusterer({
        map: mapInstance.current,
        markers: markersRef.current,
      });
    }

    updateMarkers();
  }, [mapReady, leaks]);

  useEffect(() => {
    if (!mapInstance.current) return;

    (async () => {
      const { AdvancedMarkerElement } = await window.google.maps.importLibrary(
        "marker"
      );

      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];

      leaks.forEach((leak) => {
        if (leak.lat == null || leak.lon == null) return;

        const marker = new AdvancedMarkerElement({
          map: mapInstance.current,
          position: { lat: leak.lat, lng: leak.lon },
          content: createMarkerContent(
            getColorByStatus(leak.status),
            leak.leak_id
          ),
        });

        markersRef.current.push(marker);
      });

      clustererRef.current?.clearMarkers();
      clustererRef.current = new MarkerClusterer({
        map: mapInstance.current,
        markers: markersRef.current,
      });
    })();
  }, [leaks]);

  return <div ref={mapRef} className="map-canvas" />;
}
