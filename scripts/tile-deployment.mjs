/**
 * Тайловое развёртывание: что сборка разрешает и какие origin получают место
 * в CSP. Вынесено из vite.config.mjs, чтобы правило было одно и проверялось
 * тестом, а не только сборкой. Условия для Google повторяют
 * GOOGLE_TILES_ENABLED из src/configs/mapTiles.js.
 */

const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const GOOGLE_TILES_ORIGIN = "https://tile.googleapis.com";

function getHttpOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return /^https?:\/\//.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

function envFlag(value) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function validateTileDeployment(mode, env) {
  if (mode === "development") return;
  const offlineOnly = envFlag(env.VITE_OFFLINE_MAP_ONLY);
  const requirePrivateProvider = envFlag(
    env.VITE_REQUIRE_PRIVATE_TILE_PROVIDER,
  );
  const tileUrl = String(env.VITE_TILE_URL || DEFAULT_TILE_URL).trim();
  if (!offlineOnly && !getHttpOrigin(tileUrl)) {
    throw new Error(
      "VITE_TILE_URL must be an absolute HTTP(S) URL or VITE_OFFLINE_MAP_ONLY=true",
    );
  }
  if (
    requirePrivateProvider &&
    !offlineOnly &&
    tileUrl.replace(/\/+$/, "") === DEFAULT_TILE_URL
  ) {
    throw new Error(
      "Protected deployment requires a private VITE_TILE_URL or VITE_OFFLINE_MAP_ONLY=true",
    );
  }
}

// Без ключа, в офлайн-сборке и на защищённой площадке Google не включается.
function googleTilesOrigin(env) {
  const enabled =
    String(env.VITE_GOOGLE_MAPS_KEY ?? "").trim() !== "" &&
    !envFlag(env.VITE_OFFLINE_MAP_ONLY) &&
    !envFlag(env.VITE_REQUIRE_PRIVATE_TILE_PROVIDER);
  return enabled ? GOOGLE_TILES_ORIGIN : null;
}

/** Origin тайловых серверов для img-src и connect-src боевой CSP. */
export function tileCspOrigins(env) {
  const tileOrigin = envFlag(env.VITE_OFFLINE_MAP_ONLY)
    ? null
    : getHttpOrigin(env.VITE_TILE_URL || DEFAULT_TILE_URL);
  return [tileOrigin, googleTilesOrigin(env)].filter(Boolean);
}
