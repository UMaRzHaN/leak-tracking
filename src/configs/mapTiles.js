const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com">Esri</a> - Esri, USGS, NOAA';

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

export const OFFLINE_MAP_ONLY =
  String(import.meta.env.VITE_OFFLINE_MAP_ONLY ?? "").toLowerCase() === "true";

export const PRIVATE_TILE_PROVIDER_REQUIRED =
  String(
    import.meta.env.VITE_REQUIRE_PRIVATE_TILE_PROVIDER ?? "",
  ).toLowerCase() === "true";

export const TILE_URL_BASE = trimTrailingSlashes(
  String(import.meta.env.VITE_TILE_URL || DEFAULT_TILE_URL).trim(),
);

export const IS_DEFAULT_TILE_PROVIDER =
  TILE_URL_BASE === trimTrailingSlashes(DEFAULT_TILE_URL);

export const TILE_PROVIDER_ORIGIN = (() => {
  try {
    return new URL(TILE_URL_BASE).origin;
  } catch {
    return "";
  }
})();

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
