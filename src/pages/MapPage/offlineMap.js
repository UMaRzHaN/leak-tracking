import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import i18n from "@/i18n";
import { getTileBlobUrl, cacheTile } from "@/services/maps/tileCache";
import { logger } from "@/utils/logger";
import { STATUS_META, getStatusMeta } from "@/utils/status";
import { assignTileSource, releaseTileResources } from "./tileLifecycle";
import {
  OFFLINE_MAP_ONLY,
  TILE_ATTRIBUTION,
  TILE_URL_TEMPLATE,
} from "@/configs/mapTiles";
import { distanceMeters } from "@/utils/geoUtils";

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
    tile._removed = false;
    tile._abortController = new AbortController();

    const url = this.getTileUrl(coords);

    getTileBlobUrl(url).then(async (blobUrl) => {
      if (blobUrl) {
        assignTileSource(tile, blobUrl, done, { blobUrl: true });
        return;
      }
      if (tile._removed) return;
      if (OFFLINE_MAP_ONLY) {
        assignTileSource(
          tile,
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
          done,
        );
        return;
      }

      try {
        const response = await fetch(url, {
          mode: "cors",
          signal: tile._abortController?.signal,
        });
        if (!response.ok) throw new Error("bad status");

        const responseToCache = response.clone();
        const blob = await response.blob();

        cacheTile(url, responseToCache);

        const objectUrl = URL.createObjectURL(blob);
        assignTileSource(tile, objectUrl, done, { blobUrl: true });
      } catch {
        if (tile._removed) return;
        tile.crossOrigin = "anonymous";
        assignTileSource(tile, url, done);
      }
    });

    return tile;
  },

  _removeTile(key) {
    const tile = this._tiles[key];
    releaseTileResources(tile?.el);
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

// Оборудование — не событие, и цвет статуса утечки к нему не относится.
// Своя метка, чтобы на карте нельзя было принять компонент за открытую утечку.
const COMPONENT_MARKER_COLOR = "#0ea5e9";

function isComponentMarker(item) {
  return item?.kind === "component";
}

/**
 * Осмотренная в текущем обходе точка гаснет.
 *
 * Работа обхода — не найденное, а пройденное: карта должна отвечать на вопрос
 * «где ещё не были», а он читается только тогда, когда осмотренное перестаёт
 * спорить за внимание с неосмотренным. Поэтому пройденная булавка теряет
 * заливку и бледнеет, а не меняет цвет: цвет здесь занят статусом утечки, и
 * второй смысл на него не навесить.
 *
 * Признака нет вовсе, пока обход не заведён: тогда «не осмотрено» значило бы
 * «никогда не проверялось» — другой вопрос, и отвечать на него видом булавки
 * было бы подменой.
 */
function leakIcon(leak) {
  const meta = isComponentMarker(leak)
    ? { color: COMPONENT_MARKER_COLOR }
    : (STATUS_META[leak.status] ?? STATUS_META.open);
  const safeLabel = escapeHtml(leak.leak_id ?? `#${leak.id}`);
  const checked = leak?._checkedInRound === true;
  const dotStyle = checked
    ? `background:transparent;border:2px solid ${meta.color};opacity:0.55;`
    : `background:${meta.color};border:2px solid #fff;`;

  // Ненадёжная точка носит пунктирное кольцо — «где-то здесь». Отдельная ось
  // от покрытия обхода: то гасит булавку целиком, это добавляет ей ободок, и
  // две пометки на одной точке не спорят и читаются обе.
  const accuracy = accuracyMetres(leak);
  const poorAccuracy = accuracy != null && accuracy > POOR_ACCURACY_METRES;
  const halo = poorAccuracy
    ? `<div style="
        position:absolute;left:50%;top:50%;width:21px;height:21px;
        transform:translate(-50%,-50%);border-radius:50%;
        border:1px dashed ${meta.color};opacity:0.75;pointer-events:none;
      "></div>`
    : "";

  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap;${
      checked ? "opacity:0.6;" : ""
    }">
      <div style="position:relative;width:11px;height:11px;flex-shrink:0;">
        ${halo}
        <div style="
        width:11px;height:11px;border-radius:50%;
        ${dotStyle}
        box-shadow:0 1px 5px rgba(0,0,0,0.5);
      "></div>
      </div>
      <div style="
        background:rgba(15,23,42,0.72);color:#fff;
        font-size:10px;font-weight:700;line-height:1;
        padding:2px 5px;border-radius:8px;
        backdrop-filter:blur(3px);
        max-width:72px;overflow:hidden;text-overflow:ellipsis;
        border:1px solid rgba(255,255,255,0.18);
      ">${safeLabel}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [5, 5],
    popupAnchor: [20, -6],
  });
}

/** Радиус приёмника в метрах, если он записан и осмыслен. */
function accuracyMetres(record) {
  const value = Number(record?.coords_accuracy);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * С какого радиуса точка перестаёт указывать на железо.
 *
 * Двадцать пять метров — это расстояние, на котором соседние аппараты уже не
 * различить: пришедший по такой точке окажется у другого узла и будет искать
 * бирку глазами. До десяти метров приёмник даёт в чистом поле, двадцать-сорок
 * — под эстакадой и у металла, и разница между этими случаями и есть то, что
 * кольцо показывает.
 *
 * Число не измерено, а выбрано по этому рассуждению и подтверждено владельцем
 * проекта — это решение, а не заглушка. Пересматривать его стоит от практики
 * съёмки на объекте: если годным для отчёта считается другой радиус, правится
 * одна эта строка, и метка перестроится сама.
 */
const POOR_ACCURACY_METRES = 25;

function createPopupEl(leak) {
  const labels = {
    tag: i18n.t("map.popup.tag"),
    component: i18n.t("map.popup.component"),
    description: i18n.t("map.popup.description"),
    status: i18n.t("map.popup.status"),
  };
  const el = document.createElement("div");
  const component = isComponentMarker(leak);

  const title = document.createElement("b");
  title.textContent = component
    ? `${i18n.t("map.popup.componentTag")} ${leak.leak_id ?? ""}`
    : `${labels.tag} ${leak.leak_id ?? ""}`;
  el.appendChild(title);

  const fields = component
    ? [
        [labels.component, leak.component],
        [i18n.t("map.popup.schemeTag"), leak.scheme_tag],
        [labels.status, leak.component_status],
      ]
    : [
        [labels.component, leak.component],
        [labels.description, leak.leak_description],
        [labels.status, getStatusMeta(leak.status, i18n.t.bind(i18n)).label],
      ];

  for (const [label, value] of fields) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${label}: ${value ?? ""}`;
    el.appendChild(span);
  }

  if (typeof leak?._checkedInRound === "boolean") {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${i18n.t("map.popup.round")}: ${i18n.t(
      leak._checkedInRound ? "map.popup.checked" : "map.popup.due",
    )}`;
    el.appendChild(span);
  }

  const accuracy = accuracyMetres(leak);
  if (accuracy != null) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${i18n.t("map.popup.accuracy")}: ${i18n.t(
      "map.popup.accuracyValue",
      { count: accuracy },
    )}`;
    el.appendChild(span);
  }

  return el;
}

/**
 * Круг погрешности рисуется только у раскрытой точки.
 *
 * Круг у каждой точки объект с сотнями записей превращает в кашу из
 * перекрывающихся окружностей, где не видно ни одной. А вопрос про точность
 * возникает не про все точки разом, а про ту, на которую сейчас смотрят, —
 * поэтому круг живёт ровно столько, сколько открыт её пузырёк.
 */
const ACCURACY_CIRCLE = "_accuracyCircle";
const ACCURACY_CIRCLE_OWNER = "_accuracyCircleOwner";

/**
 * Круг снимается вместе с тем пузырьком, который его завёл.
 *
 * `owner` не перестраховка: при переходе с точки на точку Leaflet закрывает
 * прежний пузырёк и открывает следующий, и стоит порядку этих двух событий
 * оказаться обратным — снятие пришло бы уже на чужой круг и стёрло бы только
 * что нарисованный. Проверка владельца делает порядок безразличным.
 */
export function clearAccuracyCircle(map, owner = undefined) {
  const circle = map?.[ACCURACY_CIRCLE];
  if (!circle) return;
  if (owner !== undefined && map[ACCURACY_CIRCLE_OWNER] !== owner) return;
  map.removeLayer(circle);
  map[ACCURACY_CIRCLE] = null;
  map[ACCURACY_CIRCLE_OWNER] = null;
}

function showAccuracyCircle(map, latlng, metres, owner) {
  if (!map) return;
  clearAccuracyCircle(map);
  map[ACCURACY_CIRCLE_OWNER] = owner;
  map[ACCURACY_CIRCLE] = L.circle(latlng, {
    radius: metres,
    // Нейтральный синий, а не цвет статуса: круг говорит про измерение, а не
    // про то, открыта утечка или устранена.
    color: "#1a73e8",
    weight: 1,
    opacity: 0.7,
    fillColor: "#1a73e8",
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map);
}

function normalizeHeading(value) {
  const heading = Number(value);
  if (!Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

function bearingDegrees(from, to) {
  const [lat1, lng1] = from.map((value) => (value * Math.PI) / 180);
  const [lat2, lng2] = to.map((value) => (value * Math.PI) / 180);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

const HEAT_PRIORITY_WEIGHT = {
  critical: 1,
  high: 0.78,
  medium: 0.48,
  low: 0.3,
};

function heatWeight(leak) {
  const speed = Number(leak.leak_speed ?? leak.emission_rate);
  if (Number.isFinite(speed) && speed > 0) {
    return Math.min(1, Math.max(0.24, Math.log10(speed + 1) / 3));
  }
  return HEAT_PRIORITY_WEIGHT[leak.priority] ?? 0.34;
}

const HeatmapLayer = L.Layer.extend({
  initialize(options = {}) {
    L.setOptions(this, options);
    this._points = [];
    this._frame = null;
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-heatmap-layer");
    this._canvas.style.position = "absolute";
    this._canvas.style.pointerEvents = "none";
    this._canvas.style.mixBlendMode = "screen";
    this._ctx = this._canvas.getContext("2d");
    map.getPanes().overlayPane.appendChild(this._canvas);

    map.on("move zoom resize", this._scheduleRedraw, this);
    this._reset();
  },

  onRemove(map) {
    map.off("move zoom resize", this._scheduleRedraw, this);
    if (this._frame != null) cancelAnimationFrame(this._frame);
    this._canvas?.remove();
    this._canvas = null;
    this._ctx = null;
    this._map = null;
  },

  setData(points = []) {
    this._points = points;
    this._scheduleRedraw();
  },

  _scheduleRedraw() {
    if (this._frame != null) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._reset();
    });
  },

  _reset() {
    if (!this._map || !this._canvas || !this._ctx) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);

    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x;
    this._canvas.height = size.y;

    this._draw();
  },

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;

    const { width, height } = this._canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    const radius = this.options.radius ?? 34;
    const maxOpacity = this.options.maxOpacity ?? 0.58;

    for (const point of this._points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;

      const pixel = this._map.latLngToContainerPoint([point.lat, point.lng]);
      const weight = heatWeight(point);
      const gradient = ctx.createRadialGradient(
        pixel.x,
        pixel.y,
        0,
        pixel.x,
        pixel.y,
        radius,
      );

      gradient.addColorStop(0, `rgba(255, 59, 48, ${maxOpacity * weight})`);
      gradient.addColorStop(0.36, `rgba(255, 149, 0, ${0.34 * weight})`);
      gradient.addColorStop(0.7, `rgba(255, 230, 0, ${0.16 * weight})`);
      gradient.addColorStop(1, "rgba(255, 230, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  },
});

export function createOfflineMap(
  container,
  {
    center,
    zoom = 13,
    initialUserCoords = /** @type {{lat?: number, lng?: number}|null} */ (null),
    gpsEnabled = true,
  },
) {
  const map = L.map(container, { zoomControl: true }).setView(center, zoom);
  let destroyed = false;
  let heatmapLayer = /** @type {any} */ (null);

  new /** @type {any} */ (CachedTileLayer)(TILE_URL_TEMPLATE, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);

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

  let userMarker = /** @type {any} */ (null);
  let gpsTrackingEnabled = false;
  let lastLatLng = /** @type {[number, number]|null} */ (null);
  let lastHeading = /** @type {number|null} */ (null);

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

  const ensureUserMarker = (
    latlng,
    heading = /** @type {number|null} */ (null),
  ) => {
    if (!userMarker) {
      userMarker = L.marker(latlng, { icon: buildUserIcon(heading) })
        .addTo(map)
        .bindPopup(i18n.language === "en" ? "You are here" : "Вы здесь");
    } else {
      userMarker.setLatLng(latlng).setIcon(buildUserIcon(heading));
    }
  };

  const initialLatLng =
    Number.isFinite(initialUserCoords?.lat) &&
    Number.isFinite(initialUserCoords?.lng)
      ? /** @type {[number, number]} */ ([
          initialUserCoords?.lat,
          initialUserCoords?.lng,
        ])
      : null;
  if (initialLatLng) {
    lastLatLng = initialLatLng;
    ensureUserMarker(initialLatLng);
  }

  const updateUserPosition = (coords) => {
    if (
      destroyed ||
      !gpsTrackingEnabled ||
      !Number.isFinite(coords?.lat) ||
      !Number.isFinite(coords?.lng)
    ) {
      return;
    }
    const latlng = /** @type {[number, number]} */ ([coords.lat, coords.lng]);
    let heading = normalizeHeading(coords.heading);
    if (
      heading == null &&
      lastLatLng &&
      distanceMeters(...lastLatLng, ...latlng) > 2
    ) {
      heading = bearingDegrees(lastLatLng, latlng);
    }
    if (heading != null) lastHeading = heading;
    lastLatLng = latlng;
    ensureUserMarker(latlng, heading ?? lastHeading);
  };

  const setGpsTracking = (
    enabled,
    fallbackCoords = /** @type {{lat?: number, lng?: number}|null} */ (null),
  ) => {
    if (destroyed) return;

    if (!enabled) {
      gpsTrackingEnabled = false;
      if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
      }
      lastLatLng = null;
      lastHeading = null;
      return;
    }

    gpsTrackingEnabled = true;
    updateUserPosition(fallbackCoords);
  };

  setGpsTracking(gpsEnabled, initialUserCoords);

  const locateMe = (
    fallbackCoords = /** @type {{lat?: number, lng?: number}|null} */ (null),
  ) => {
    if (destroyed) return;

    const fallbackLatLng =
      Number.isFinite(fallbackCoords?.lat) &&
      Number.isFinite(fallbackCoords?.lng)
        ? /** @type {[number, number]} */ ([
            fallbackCoords?.lat,
            fallbackCoords?.lng,
          ])
        : null;

    if (lastLatLng) {
      ensureUserMarker(lastLatLng);
      map.setView(lastLatLng, 17, { animate: true });
    } else if (fallbackLatLng) {
      lastLatLng = fallbackLatLng;
      ensureUserMarker(fallbackLatLng);
      map.setView(fallbackLatLng, 17, { animate: true });
    }
  };

  const setHeatmap = (points = []) => {
    if (destroyed) return;
    const hasPoints = points.some(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );

    if (!hasPoints) {
      if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
        heatmapLayer = null;
      }
      return;
    }

    if (!heatmapLayer) {
      heatmapLayer = new /** @type {any} */ (HeatmapLayer)({
        radius: 38,
      }).addTo(map);
    }
    heatmapLayer.setData(points);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;

    try {
      if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
        heatmapLayer = null;
      }
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

  return { map, markersLayer, locateMe, setGpsTracking, setHeatmap, destroy };
}

export function addMarkers(
  markersLayer,
  leaks = /** @type {any[]} */ ([]),
  map = /** @type {any} */ (null),
) {
  if (!markersLayer) return;

  markersLayer.clearLayers();
  clearAccuracyCircle(map);

  leaks.forEach((leak) => {
    if (!Number.isFinite(leak.lat) || !Number.isFinite(leak.lng)) return;

    const latlng = /** @type {[number, number]} */ ([leak.lat, leak.lng]);
    const accuracy = accuracyMetres(leak);
    L.marker(latlng, { icon: leakIcon(leak) })
      .on("popupopen", () => {
        if (accuracy != null) showAccuracyCircle(map, latlng, accuracy, leak);
        else clearAccuracyCircle(map);
      })
      .on("popupclose", () => clearAccuracyCircle(map, leak))
      .on("click", () => {
        if (!map) return;

        map._suppressLeakClickMoveend = true;
        map.setView(latlng, Math.max(map.getZoom(), 18), { animate: true });
        setTimeout(() => {
          if (map) map._suppressLeakClickMoveend = false;
        }, 500);
      })
      .addTo(markersLayer)
      .bindPopup(() => createPopupEl(leak), { autoPan: false });
  });
}
