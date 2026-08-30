import { isNative } from "@/utils/platform";
import { TILE_URL_TEMPLATE } from "@/configs/mapTiles";

// Bookkeeping for the tile cache: how many tiles are stored and when each was
// last used. It lives in localStorage rather than beside the tiles themselves,
// so the eviction pass can order candidates without reading every file.

export const TILE_ROOT_DIR = "map-tiles";
const NATIVE_CACHE_FORMAT_VERSION = "v3";
const LEGACY_NATIVE_COUNT_KEY = "map-tiles-native-count";
const WEB_METADATA_KEY = "map-tiles-metadata-v1";
const NATIVE_COUNT_PREFIX = "map-tiles-native-count:";
const NATIVE_METADATA_PREFIX = "map-tiles-native-metadata:";

export function buildNativeTileCacheNamespace(tileUrlTemplate) {
  const value = String(tileUrlTemplate ?? "").trim();
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${NATIVE_CACHE_FORMAT_VERSION}-${(hash >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export const NATIVE_TILE_CACHE_NAMESPACE =
  buildNativeTileCacheNamespace(TILE_URL_TEMPLATE);
export const NATIVE_TILE_CACHE_DIR = `${TILE_ROOT_DIR}/${NATIVE_TILE_CACHE_NAMESPACE}`;
export const NATIVE_TILE_CACHE_COUNT_KEY = `${NATIVE_COUNT_PREFIX}${NATIVE_TILE_CACHE_NAMESPACE}`;
export const NATIVE_TILE_CACHE_METADATA_KEY = `${NATIVE_METADATA_PREFIX}${NATIVE_TILE_CACHE_NAMESPACE}`;

export function getNativeCount() {
  const count = Number.parseInt(
    localStorage.getItem(NATIVE_TILE_CACHE_COUNT_KEY) || "0",
    10,
  );
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function setNativeCount(count) {
  localStorage.setItem(NATIVE_TILE_CACHE_COUNT_KEY, String(Math.max(0, count)));
}

export function incrementNativeCount() {
  localStorage.setItem(
    NATIVE_TILE_CACHE_COUNT_KEY,
    String(getNativeCount() + 1),
  );
}

export function resetNativeCount() {
  localStorage.removeItem(NATIVE_TILE_CACHE_COUNT_KEY);
}

function metadataKey() {
  return isNative ? NATIVE_TILE_CACHE_METADATA_KEY : WEB_METADATA_KEY;
}

export function readMetadata() {
  try {
    const parsed = JSON.parse(localStorage.getItem(metadataKey()) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function writeMetadata(metadata) {
  try {
    localStorage.setItem(metadataKey(), JSON.stringify(metadata));
  } catch {
    // Cache remains usable when localStorage is unavailable.
  }
}

export function touchMetadata(key) {
  const metadata = readMetadata();
  metadata[key] = Date.now();
  writeMetadata(metadata);
}

export function removeMetadata(keys) {
  const metadata = readMetadata();
  keys.forEach((key) => delete metadata[key]);
  writeMetadata(metadata);
}

export function oldestKeys(keys, metadata, count) {
  return [...keys]
    .sort(
      (left, right) =>
        Number(metadata[left] ?? 0) - Number(metadata[right] ?? 0),
    )
    .slice(0, count);
}

/**
 * Every localStorage key this module may have written, including the ones a
 * previous cache format left behind — clearing the cache must not strand them.
 */
/**
 * @param {string|null} key
 * @returns {key is string} у отсутствующего ключа имени нет — и совпасть ему не с чем
 */
export function isTileCacheStorageKey(key) {
  return (
    key === LEGACY_NATIVE_COUNT_KEY ||
    key === WEB_METADATA_KEY ||
    Boolean(key?.startsWith(NATIVE_COUNT_PREFIX)) ||
    Boolean(key?.startsWith(NATIVE_METADATA_PREFIX))
  );
}

export function clearWebMetadata() {
  localStorage.removeItem(WEB_METADATA_KEY);
}
