import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { getTileBlobUrl, cacheTile } from "./tileCache";
import { STATUS_META } from "../../utils/status";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── Cached tile layer ── */
const CachedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement("img");
    tile.alt = "";

    const url = this.getTileUrl(coords);

    getTileBlobUrl(url).then(async (blobUrl) => {
      if (blobUrl) {
        tile._blobUrl = blobUrl;
        tile.onload = () => done(null, tile);
        tile.onerror = (e) => done(e, tile);
        tile.src = blobUrl;
        return;
      }

      // Один fetch — одновременно для отображения и кэширования
      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) throw new Error("bad status");

        const responseToCache = response.clone();
        const blob = await response.blob();

        cacheTile(url, responseToCache);

        const objectUrl = URL.createObjectURL(blob);
        tile._blobUrl = objectUrl;
        tile.onload = () => done(null, tile);
        tile.onerror = (e) => done(e, tile);
        tile.src = objectUrl;
      } catch {
        // fetch недоступен (оффлайн, CORS) — загружаем напрямую без кэша
        tile.crossOrigin = "anonymous";
        tile.onload = () => done(null, tile);
        tile.onerror = (e) => done(e, tile);
        tile.src = url;
      }
    });

    return tile;
  },

  _removeTile(key) {
    const tile = this._tiles[key];
    if (tile?.el?._blobUrl) {
      URL.revokeObjectURL(tile.el._blobUrl);
      tile.el._blobUrl = null;
    }
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

/* ── Marker icon with label tag ── */
function leakIcon(leak) {
  const meta = STATUS_META[leak.status] ?? STATUS_META.open;
  // escapeHtml prevents XSS from user-supplied leak_id / id
  const safeLabel = escapeHtml(leak.leak_id ?? `#${leak.id}`);
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap;">
      <div style="
        width:11px;height:11px;flex-shrink:0;border-radius:50%;
        background:${meta.color};border:2px solid #fff;
        box-shadow:0 1px 5px rgba(0,0,0,0.5);
      "></div>
      <div style="
        background:rgba(15,23,42,0.72);color:#fff;
        font-size:10px;font-weight:700;line-height:1;
        padding:2px 5px;border-radius:8px;
        backdrop-filter:blur(3px);
        max-width:72px;overflow:hidden;text-overflow:ellipsis;
        border:1px solid rgba(255,255,255,0.18);
      ">${safeLabel}</div>
    </div>`,
    iconSize: null,
    iconAnchor: [5, 5],
    popupAnchor: [20, -6],
  });
}

/* ── Popup DOM element (XSS-safe via textContent) ── */
function createPopupEl(leak) {
  const meta = STATUS_META[leak.status] ?? STATUS_META.open;
  const el = document.createElement("div");

  const title = document.createElement("b");
  title.textContent = `Бирка № ${leak.leak_id ?? ""}`;
  el.appendChild(title);

  const fields = [
    ["Компонент", leak.component],
    ["Описание утечки", leak.leak_description],
    ["Статус", meta.label],
  ];

  for (const [label, value] of fields) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${label}: ${value ?? ""}`;
    el.appendChild(span);
  }

  return el;
}

/* ── Main factory ── */
export function createOfflineMap(container, { center, zoom = 13 }) {
  const map = L.map(container, { zoomControl: true }).setView(center, zoom);

  new CachedTileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.esri.com">Esri</a> — Esri, USGS, NOAA',
    },
  ).addTo(map);

  const markersLayer = L.markerClusterGroup({
    maxClusterRadius: 48,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: "",
        html: `<div style="
          width:34px;height:34px;border-radius:50%;
          background:#2563eb;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:12px;font-weight:700;
        ">${count}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
    },
  }).addTo(map);

  /* ── Геолокация пользователя ── */
  let userMarker = null;
  let watchId = null;
  let lastLatLng = null;

  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        lastLatLng = latlng;
        if (!userMarker) {
          userMarker = L.circleMarker(latlng, {
            radius: 7,
            fillColor: "#1a73e8",
            color: "#fff",
            weight: 2.5,
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup("Вы здесь");
        } else {
          userMarker.setLatLng(latlng);
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 },
    );
  }

  const locateMe = () => {
    if (lastLatLng) {
      map.setView(lastLatLng, 17, { animate: true });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latlng = [pos.coords.latitude, pos.coords.longitude];
          lastLatLng = latlng;
          map.setView(latlng, 17, { animate: true });
        },
        () => {},
      );
    }
  };

  const destroy = () => {
    if (watchId != null) navigator.geolocation?.clearWatch(watchId);
    map.remove();
  };

  return { map, markersLayer, locateMe, destroy };
}

/* ── Обновление маркеров ── */
export function addMarkers(markersLayer, leaks = []) {
  if (!markersLayer) return;

  markersLayer.clearLayers();

  leaks.forEach((leak) => {
    if (!Number.isFinite(leak.lat) || !Number.isFinite(leak.lng)) return;

    L.marker([leak.lat, leak.lng], { icon: leakIcon(leak) })
      .addTo(markersLayer)
      .bindPopup(() => createPopupEl(leak));
  });
}
