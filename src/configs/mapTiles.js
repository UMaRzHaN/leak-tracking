const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com">Esri</a> - Esri, USGS, NOAA';

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

export const TILE_URL_BASE = trimTrailingSlashes(
  String(import.meta.env.VITE_TILE_URL || DEFAULT_TILE_URL).trim(),
);

export const TILE_URL_TEMPLATE = TILE_URL_BASE.includes("{z}")
  ? TILE_URL_BASE
  : `${TILE_URL_BASE}/{z}/{y}/{x}`;

export const TILE_ATTRIBUTION =
  String(import.meta.env.VITE_TILE_ATTRIBUTION || "").trim() ||
  (TILE_URL_BASE === DEFAULT_TILE_URL ? DEFAULT_TILE_ATTRIBUTION : "");

export function buildMapTileUrl(z, y, x) {
  return TILE_URL_TEMPLATE.replace("{z}", String(z))
    .replace("{y}", String(y))
    .replace("{x}", String(x));
}
