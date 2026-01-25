import { MarkerClusterer } from "@googlemaps/markerclusterer";

/* ======================================================
   HELPERS
   ====================================================== */

export function getColorByStatus(speed) {
  return speed <= 25 ? "#4caf50" : speed >= 100 ? "#f44336" : "#ff9800";
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
  el.style.userSelect = "none";

  el.textContent = label;

  return el;
}

/* ======================================================
   CLUSTER RENDERER
   ====================================================== */

const clusterRenderer = {
  render({ count, position }) {
    const el = document.createElement("div");

    el.style.width = "36px";
    el.style.height = "36px";
    el.style.borderRadius = "50%";
    el.style.background = "#2563eb";
    el.style.color = "#fff";

    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";

    el.style.fontSize = "14px";
    el.style.fontWeight = "700";
    el.style.boxShadow = "0 4px 10px rgba(0,0,0,0.35)";
    el.textContent = count;

    return new window.google.maps.marker.AdvancedMarkerElement({
      position,
      content: el,
      zIndex: 1000 + count,
    });
  },
};

/* ======================================================
   MARKERS + CLUSTER
   ====================================================== */

export async function updateMarkers({
  map,
  leaks,
  markersRef,
  clustererRef,
  onSelectLeak,
}) {
  if (!map) return;

  const { AdvancedMarkerElement } =
    await window.google.maps.importLibrary("marker");

  /* ===== CLEAR OLD MARKERS ===== */
  markersRef.current.forEach((marker) => {
    marker.map = null;
  });
  markersRef.current = [];

  /* ===== CREATE NEW MARKERS ===== */
  for (const leak of leaks) {
    if (leak?.lat == null || leak?.lng == null) continue;

    const marker = new AdvancedMarkerElement({
      map,
      position: {
        lat: Number(leak.lat),
        lng: Number(leak.lng),
      },
      content: createMarkerContent(getColorByStatus(leak.speed), leak.leak_id),
    });

    if (onSelectLeak) {
      marker.addListener("click", () => onSelectLeak(leak));
    }

    markersRef.current.push(marker);
  }

  /* ===== CLUSTER ===== */
  if (clustererRef.current) {
    clustererRef.current.clearMarkers();
  }

  clustererRef.current = new MarkerClusterer({
    map,
    markers: markersRef.current,
    renderer: clusterRenderer,
  });
}

/* ======================================================
   AUTO CENTER
   ====================================================== */
export function autoCenterMap({ map, leaks, userCoords }) {
  if (!map) return;

  if (leaks.length > 1) {
    const bounds = new window.google.maps.LatLngBounds();

    leaks.forEach((l) => {
      if (l?.lat != null && l?.lng != null) {
        bounds.extend({
          lat: Number(l.lat),
          lng: Number(l.lng),
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
    return;
  }

  if (leaks.length === 1) {
    map.setCenter({
      lat: Number(leaks[0].lat),
      lng: Number(leaks[0].lng),
    });
    map.setZoom(16);
    return;
  }

  // 🔥 fallback → пользователь
  if (userCoords) {
    map.setCenter(userCoords);
    map.setZoom(15);
  }
}
