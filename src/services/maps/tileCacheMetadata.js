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

/*
 * Отметки последнего использования живут в памяти, а в localStorage уходят
 * отложенно. Раньше каждый показанный тайл разбирал и заново сериализовал всю
 * таблицу — до шести тысяч записей — и синхронно писал её обратно: на панораме
 * карты это десятки полных циклов JSON в секунду на главном потоке.
 */
const FLUSH_DELAY_MS = 2000;

/** @type {{ key: string, data: Record<string, number> } | null} */
let memory = null;
let dirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;
let pageListenersAttached = false;

function loadFromStorage(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function cancelScheduledFlush() {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
}

/** Пишет накопленное в localStorage сразу. */
export function flushMetadata() {
  cancelScheduledFlush();
  if (!memory || !dirty) return;
  dirty = false;
  try {
    localStorage.setItem(memory.key, JSON.stringify(memory.data));
  } catch {
    // Cache remains usable when localStorage is unavailable.
  }
}

function attachPageListeners() {
  if (pageListenersAttached || typeof window === "undefined") return;
  pageListenersAttached = true;
  // Уход со страницы или сворачивание приложения — последний надёжный момент:
  // отложенный таймер после этого может уже не сработать.
  window.addEventListener("pagehide", flushMetadata);
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushMetadata();
  });
}

function scheduleFlush() {
  dirty = true;
  attachPageListeners();
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushMetadata, FLUSH_DELAY_MS);
}

/**
 * Забывает таблицу в памяти вместе с несброшенными отметками — когда хранилище
 * очистили или подменили в обход этого модуля (очистка кэша, тесты).
 */
export function resetMetadataMemory() {
  cancelScheduledFlush();
  memory = null;
  dirty = false;
}

/**
 * Живая таблица из памяти — не копия: менять её можно только через функции
 * этого модуля, иначе изменение не дойдёт до хранилища.
 */
export function readMetadata() {
  const key = metadataKey();
  if (!memory || memory.key !== key) {
    memory = { key, data: loadFromStorage(key) };
    dirty = false;
  }
  return memory.data;
}

export function writeMetadata(metadata) {
  memory = { key: metadataKey(), data: metadata };
  // Пересборка таблицы — редкий проход квоты, его не откладываем.
  dirty = true;
  flushMetadata();
}

export function touchMetadata(key) {
  readMetadata()[key] = Date.now();
  scheduleFlush();
}

export function removeMetadata(keys) {
  const metadata = readMetadata();
  keys.forEach((key) => delete metadata[key]);
  dirty = true;
  flushMetadata();
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
  resetMetadataMemory();
  localStorage.removeItem(WEB_METADATA_KEY);
}
