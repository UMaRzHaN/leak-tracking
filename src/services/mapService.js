import { MarkerClusterer } from "@googlemaps/markerclusterer";

/* ======================================
   HELPERS
====================================== */

export function getColorByStatus(status) {
  if (status === "Fixed") return "#4CAF50";
  if (status === "Active") return "#F44336";
  return "#FBC02D";
}

export function createMarkerContent(color, label) {
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

/* ======================================
   MARKERS + CLUSTER
====================================== */

export async function updateMarkers({ map, leaks, markersRef, clustererRef }) {
  const { AdvancedMarkerElement } =
    await window.google.maps.importLibrary("marker");

  // очистка
  markersRef.current.forEach((m) => (m.map = null));
  markersRef.current = [];

  leaks.forEach((leak) => {
    if (leak?.lat == null || leak?.lon == null) return;

    const marker = new AdvancedMarkerElement({
      map,
      position: {
        lat: Number(leak.lat),
        lng: Number(leak.lon),
      },
      content: createMarkerContent(getColorByStatus(leak.status), leak.leak_id),
    });

    markersRef.current.push(marker);
  });

  clustererRef.current?.clearMarkers();
  clustererRef.current = new MarkerClusterer({
    map,
    markers: markersRef.current,
  });
}

/* ======================================
   AUTO CENTER
====================================== */

export function autoCenterMap({ map, leaks }) {
  if (!map) return;

  if (leaks.length > 1) {
    const bounds = new window.google.maps.LatLngBounds();

    leaks.forEach((l) => {
      if (l.lat != null && l.lon != null) {
        bounds.extend({
          lat: Number(l.lat),
          lng: Number(l.lon),
        });
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        top: 80,
        bottom: 120,
        left: 40,
        right: 40,
      });
    }
  } else if (leaks.length === 1) {
    map.setCenter({
      lat: Number(leaks[0].lat),
      lng: Number(leaks[0].lon),
    });
    map.setZoom(15);
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        map.setZoom(14);
      },
      () => {
        map.setCenter({ lat: 41.3111, lng: 69.2797 });
        map.setZoom(12);
      }
    );
  }
}
