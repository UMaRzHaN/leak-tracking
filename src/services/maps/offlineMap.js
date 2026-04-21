import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getTileBlobUrl, cacheTile } from "./tileCache";
import { STATUS_META } from "../../utils/status";

/* ── Cached tile layer ── */
const CachedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement("img");
    tile.alt = "";

    const url = this.getTileUrl(coords);

    getTileBlobUrl(url).then((blobUrl) => {
      if (blobUrl) {
        tile._blobUrl = blobUrl;
        tile.onload = () => done(null, tile);
        tile.onerror = (e) => done(e, tile);
        tile.src = blobUrl;
      } else {
        tile.crossOrigin = "anonymous";
        tile.onload = () => {
          cacheTile(url);
          done(null, tile);
        };
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

/* ── Status-coloured marker icon ── */
function statusIcon(status) {
  const meta = STATUS_META[status] ?? STATUS_META.open;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:13px;height:13px;border-radius:50%;
      background:${meta.color};border:2.5px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
    popupAnchor: [0, -10],
  });
}

/* ── Main factory ── */
export function createOfflineMap(container, { center, zoom = 13 }) {
  const map = L.map(container, { zoomControl: true }).setView(center, zoom);

  new CachedTileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: '© <a href="https://www.esri.com">Esri</a> — Esri, USGS, NOAA',
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);

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

    L.marker([leak.lat, leak.lng], { icon: statusIcon(leak.status) })
      .addTo(markersLayer)
      .bindPopup(
        `<b>№ ${leak.leak_id ?? ""}</b><br/>${leak.component ?? ""}<br/>${leak.status ?? ""}`,
      );
  });
}
