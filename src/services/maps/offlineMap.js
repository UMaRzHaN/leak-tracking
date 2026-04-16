import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function createOfflineMap(container, { center, zoom = 13 }) {
  const map = L.map(container).setView(center, zoom);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
    }
  ).addTo(map);

  return map;
}

export function addMarkers(map, leaks) {
  leaks.forEach((leak) => {
    if (!leak.lat || !leak.lng) return;

    L.marker([leak.lat, leak.lng])
      .addTo(map)
      .bindPopup(
        `${leak.component || ""}<br/>${leak.status || ""}`
      );
  });
}