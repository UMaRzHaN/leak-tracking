import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function createOfflineMap(container, { center, zoom = 13 }) {
  const map = L.map(container, {
    zoomControl: true,
  }).setView(center, zoom);

  /* ── Базовый фон (работает всегда) ── */
  L.rectangle(
    [
      [-90, -180],
      [90, 180],
    ],
    {
      color: "#e5e7eb",
      weight: 1,
      fillColor: "#f3f4f6",
      fillOpacity: 1,
    },
  ).addTo(map);

  /* ── Онлайн слой (если есть интернет) ── */
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    errorTileUrl: "",
  }).addTo(map);

  /* ── Слой для маркеров (КЛЮЧЕВОЕ) ── */
  const markersLayer = L.layerGroup().addTo(map);

  return { map, markersLayer };
}

export function addMarkers(markersLayer, leaks = []) {
  if (!markersLayer) return;

  // ❗ очищаем старые маркеры
  markersLayer.clearLayers();

  leaks.forEach((leak) => {
    if (!Number.isFinite(leak.lat) || !Number.isFinite(leak.lng)) return;

    L.marker([leak.lat, leak.lng])
      .addTo(markersLayer)
      .bindPopup(`${leak.component || "Leak"}<br/>${leak.status || ""}`);
  });
}
