import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import i18n from "@/i18n";
import { getTileBlobUrl, cacheTile } from "@/services/maps/tileCache";
import { logger } from "@/utils/logger";
import { STATUS_META, getStatusMeta } from "@/utils/status";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
      try {
        tile.el.onload = null;
        tile.el.onerror = null;
        if (
          typeof tile.el.src === "string" &&
          tile.el.src.startsWith("blob:")
        ) {
          tile.el.src = "";
        }
      } catch {
        // ignore
      }
      URL.revokeObjectURL(tile.el._blobUrl);
      tile.el._blobUrl = null;
    }
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

function leakIcon(leak) {
  const meta = STATUS_META[leak.status] ?? STATUS_META.open;
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

function createPopupEl(leak) {
  const meta = getStatusMeta(leak.status);
  const el = document.createElement("div");

  const title = document.createElement("b");
  title.textContent = i18n.t("map.popup.tag", {
    defaultValue: `Tag No. ${leak.leak_id ?? ""}`,
  });
  el.appendChild(title);

  const fields = [
    [
      i18n.t("map.popup.component", { defaultValue: "Component" }),
      leak.component,
    ],
    [
      i18n.t("map.popup.description", { defaultValue: "Leak description" }),
      leak.leak_description,
    ],
    [i18n.t("map.popup.status", { defaultValue: "Status" }), meta.label],
  ];

  for (const [label, value] of fields) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${label}: ${value ?? ""}`;
    el.appendChild(span);
  }

  return el;
}

export function createOfflineMap(
  container,
  { center, zoom = 13, initialUserCoords = null },
) {
  const map = L.map(container, { zoomControl: true }).setView(center, zoom);
  let destroyed = false;

  new CachedTileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.esri.com">Esri</a> - Esri, USGS, NOAA',
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

  let userMarker = null;
  let watchId = null;
  let lastLatLng = null;

  const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000,
  };

  const buildUserIcon = (heading) => {
    const hasHeading =
      heading !== null && heading !== undefined && !isNaN(heading);
    const arrowSvg = hasHeading
      ? `<svg style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${heading}deg);overflow:visible;pointer-events:none" width="14" height="14" viewBox="-7 -7 14 14">
           <polygon points="0,-20 -5,-9 5,-9" fill="#1a73e8" fill-opacity="0.9" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
         </svg>`
      : "";
    return L.divIcon({
      html: `<div style="position:relative;width:14px;height:14px">
               ${arrowSvg}
               <div style="width:14px;height:14px;background:#1a73e8;border:2.5px solid white;border-radius:50%;position:absolute;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>
             </div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -12],
      className: "",
    });
  };

  const ensureUserMarker = (latlng, heading = null) => {
    if (!userMarker) {
      userMarker = L.marker(latlng, { icon: buildUserIcon(heading) })
        .addTo(map)
        .bindPopup(
          i18n.t("map.popup.youAreHere", { defaultValue: "You are here" }),
        );
    } else {
      userMarker.setLatLng(latlng).setIcon(buildUserIcon(heading));
    }
  };

  const initialLatLng =
    Number.isFinite(initialUserCoords?.lat) &&
    Number.isFinite(initialUserCoords?.lng)
      ? [initialUserCoords.lat, initialUserCoords.lng]
      : null;
  if (initialLatLng) {
    lastLatLng = initialLatLng;
    ensureUserMarker(initialLatLng);
  }

  const onGeoPosition = (pos) => {
    if (destroyed) return;
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    const heading = pos.coords.heading;
    lastLatLng = latlng;
    ensureUserMarker(latlng, heading);
  };

  const startGpsWatch = () => {
    if (watchId != null || destroyed || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      onGeoPosition,
      () => {},
      geoOptions,
    );
  };

  const stopGpsWatch = () => {
    if (watchId == null) return;
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };

  const handleVisibilityChange = () => {
    if (destroyed) return;
    if (document.hidden) stopGpsWatch();
    else startGpsWatch();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  startGpsWatch();

  const locateMe = (fallbackCoords = null) => {
    if (destroyed) return;

    const fallbackLatLng =
      Number.isFinite(fallbackCoords?.lat) &&
      Number.isFinite(fallbackCoords?.lng)
        ? [fallbackCoords.lat, fallbackCoords.lng]
        : null;

    if (lastLatLng) {
      ensureUserMarker(lastLatLng);
      map.setView(lastLatLng, 17, { animate: true });
    } else if (fallbackLatLng) {
      lastLatLng = fallbackLatLng;
      ensureUserMarker(fallbackLatLng);
      map.setView(fallbackLatLng, 17, { animate: true });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (destroyed) return;
          onGeoPosition(pos);
          map.setView(lastLatLng, 17, { animate: true });
        },
        () => {},
        geoOptions,
      );
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;

    document.removeEventListener("visibilitychange", handleVisibilityChange);

    try {
      stopGpsWatch();
    } catch {
      // ignore
    }

    try {
      map.off();
    } catch {
      // ignore
    }

    try {
      map.remove();
    } catch (err) {
      logger.warn("Leaflet map destroy error:", err);
    }
  };

  return { map, markersLayer, locateMe, destroy };
}

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
