import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { buildMapTileUrl, OFFLINE_MAP_ONLY } from "@/configs/mapTiles";
import {
  clearWebMetadata,
  getNativeCount,
  incrementNativeCount,
  isTileCacheStorageKey,
  NATIVE_TILE_CACHE_DIR,
  oldestKeys,
  readMetadata,
  removeMetadata,
  resetNativeCount,
  setNativeCount,
  TILE_ROOT_DIR,
  touchMetadata,
  writeMetadata,
} from "./tileCacheMetadata";

export {
  buildNativeTileCacheNamespace,
  NATIVE_TILE_CACHE_COUNT_KEY,
  NATIVE_TILE_CACHE_DIR,
  NATIVE_TILE_CACHE_METADATA_KEY,
  NATIVE_TILE_CACHE_NAMESPACE,
} from "./tileCacheMetadata";
import { ignoredError } from "@/utils/ignoredError";
import { fromEntries } from "@/utils/fromEntries";

const CACHE_NAME = "map-tiles-v2";
const MAX_MERCATOR_LAT = 85.05112878;
const FILESYSTEM_NOT_FOUND_CODE = "OS-PLUG-FILE-0008";
export const MAX_TILE_CACHE_ENTRIES = 6_000;
const TILE_CACHE_EVICTION_TARGET = 5_400;

const webSupported = typeof caches !== "undefined";

function clampLatitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, number));
}

function normalizeLongitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return ((((number + 180) % 360) + 360) % 360) - 180;
}

function tileY(latitude, tileCount) {
  const latRad = (latitude * Math.PI) / 180;
  const value = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      tileCount,
  );
  return Math.max(0, Math.min(tileCount - 1, value));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tileFilePath(url) {
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i);
  if (!match) return null;
  return `${NATIVE_TILE_CACHE_DIR}/${match[1]}/${match[2]}/${match[3]}.jpg`;
}

function isNativeTilePath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith(`${NATIVE_TILE_CACHE_DIR}/`)
  ) {
    return false;
  }
  return /^\d+\/\d+\/\d+\.jpg$/.test(
    path.slice(NATIVE_TILE_CACHE_DIR.length + 1),
  );
}

export function buildTileUrls(lat, lng, minZoom, maxZoom) {
  const safeLat = clampLatitude(lat);
  const safeLng = normalizeLongitude(lng);
  if (safeLat == null || safeLng == null) return [];
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const cx = Math.floor(((safeLng + 180) / 360) * n);
    const cy = tileY(safeLat, n);
    const radius = z <= 13 ? 1 : z <= 14 ? 2 : z <= 15 ? 2 : 3;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        urls.push(buildMapTileUrl(z, y, x));
      }
    }
  }
  return urls;
}

function throwIfAborted(signal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

async function fetchWithTimeout(url, ms = 10000, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const abort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    throwIfAborted(signal);
    return await fetch(url, { mode: "cors", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function filterWithConcurrency(items, concurrency, predicate) {
  const matches = new Array(items.length).fill(false);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      matches[index] = await predicate(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return items.filter((_, index) => matches[index]);
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToObjectUrl(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

// ── Native (Filesystem) ───────────────────────────────────────────────────────

async function nativeExists(path) {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

async function nativeRead(url) {
  const path = tileFilePath(url);
  if (!path) return null;
  try {
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    });
    touchMetadata(path);
    return base64ToObjectUrl(data);
  } catch {
    return null;
  }
}

// A response is reusable only while its body is still readable. Anything else
// (a consumed clone, a mock without a body) falls back to fetching.
function isReusableResponse(response) {
  return (
    Boolean(response) &&
    typeof response.blob === "function" &&
    response.bodyUsed !== true
  );
}

async function nativeWrite(
  url,
  skipMkdir = false,
  signal,
  prefetchedResponse = null,
) {
  const path = tileFilePath(url);
  if (!path || (await nativeExists(path))) return false;
  try {
    throwIfAborted(signal);
    // Interactive panning already downloaded this tile to paint it and hands
    // the response over, so refetching here would double the mobile traffic of
    // every map move. Bulk preloading passes nothing and still fetches itself.
    const response = isReusableResponse(prefetchedResponse)
      ? prefetchedResponse
      : await fetchWithTimeout(url, 10000, signal);
    if (!response.ok) return false;
    const base64 = await blobToBase64(await response.blob());
    throwIfAborted(signal);
    if (!skipMkdir) {
      const dir = path.substring(0, path.lastIndexOf("/"));
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Data,
        recursive: true,
      }).catch(ignoredError("tileCache.removeDirectory"));
    }
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
    });
    touchMetadata(path);
    return true;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function enforceWebQuota(cache) {
  let metadata = readMetadata();
  // Cache Storage and localStorage are not transactional. Always reconcile
  // against the actual cache before deciding that no eviction is needed.
  const requests = await cache.keys();
  const byUrl = new Map(requests.map((request) => [request.url, request]));
  metadata = fromEntries(
    requests.map((request) => [request.url, metadata[request.url] ?? 0]),
  );
  writeMetadata(metadata);

  if (requests.length <= MAX_TILE_CACHE_ENTRIES) return;
  const removeCount = Math.max(0, requests.length - TILE_CACHE_EVICTION_TARGET);
  const victims = oldestKeys(byUrl.keys(), metadata, removeCount);
  await Promise.all(victims.map((url) => cache.delete(byUrl.get(url))));
  removeMetadata(victims);
}

async function enforceNativeQuota() {
  const count = getNativeCount();
  if (count <= MAX_TILE_CACHE_ENTRIES) return;
  const storedMetadata = readMetadata();
  const metadata = fromEntries(
    Object.entries(storedMetadata).filter(([path]) => isNativeTilePath(path)),
  );
  if (Object.keys(metadata).length !== Object.keys(storedMetadata).length) {
    writeMetadata(metadata);
  }
  const paths = Object.keys(metadata);
  const removeCount = count - TILE_CACHE_EVICTION_TARGET;

  // Legacy caches only stored a count, so their files cannot be evicted safely.
  if (paths.length < removeCount) {
    await clearMapCache();
    return;
  }

  const victims = oldestKeys(paths, metadata, removeCount);
  const deleted = (
    await Promise.all(
      victims.map(async (path) => {
        try {
          await Filesystem.deleteFile({ path, directory: Directory.Data });
          return path;
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean);
  removeMetadata(deleted);
  setNativeCount(count - deleted.length);
}
export async function getTileBlobUrl(url) {
  if (isNative) return nativeRead(url);
  if (!webSupported) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    if (!response) return null;
    touchMetadata(url);
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

export async function cacheTile(url, prefetchedResponse = null) {
  if (isNative) {
    const saved = await nativeWrite(url, false, undefined, prefetchedResponse);
    if (saved) {
      incrementNativeCount();
      await enforceNativeQuota();
    }
    return;
  }
  if (!webSupported) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(url)) {
      touchMetadata(url);
      await enforceWebQuota(cache);
      return;
    }
    const response = prefetchedResponse ?? (await fetch(url, { mode: "cors" }));
    if (response.ok) {
      await cache.put(url, response);
      touchMetadata(url);
      await enforceWebQuota(cache);
    }
  } catch {
    // ignore
  }
}

export async function getMapCacheInfo() {
  if (isNative) {
    const count = getNativeCount();
    const sizeMB = Math.round(((count * 40) / 1024) * 10) / 10;
    return { count, sizeMB };
  }
  if (!webSupported) return { count: 0, sizeMB: 0 };
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const sizeMB = Math.round(((keys.length * 40) / 1024) * 10) / 10;
    return { count: keys.length, sizeMB };
  } catch {
    return { count: 0, sizeMB: 0 };
  }
}

export async function clearMapCache() {
  if (isNative) {
    try {
      await Filesystem.rmdir({
        path: TILE_ROOT_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (error) {
      // Capacitor Filesystem v8 exposes a stable not-found code. Any other
      // failure must preserve count/LRU metadata and be surfaced to the caller.
      if (error?.code !== FILESYSTEM_NOT_FOUND_CODE) throw error;
    }
    resetNativeCount();
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (isTileCacheStorageKey(key)) localStorage.removeItem(key);
    }
    return;
  }
  if (webSupported) await caches.delete(CACHE_NAME);
  clearWebMetadata();
}

export function buildViewportTileUrls(bounds, minZoom, maxZoom) {
  const { north, south, east, west } = bounds;
  const safeNorth = clampLatitude(north);
  const safeSouth = clampLatitude(south);
  const safeEast = Number(east);
  const safeWest = Number(west);
  if (
    safeNorth == null ||
    safeSouth == null ||
    !Number.isFinite(safeEast) ||
    !Number.isFinite(safeWest)
  ) {
    return [];
  }
  const westBound = Math.max(-180, Math.min(180, safeWest));
  const eastBound = Math.max(-180, Math.min(180, safeEast));
  const longitudeRanges =
    westBound <= eastBound
      ? [[westBound, eastBound]]
      : [
          [westBound, 180],
          [-180, eastBound],
        ];
  const urls = new Set();
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const y1 = tileY(Math.max(safeNorth, safeSouth), n);
    const y2 = tileY(Math.min(safeNorth, safeSouth), n);
    for (const [rangeWest, rangeEast] of longitudeRanges) {
      const x1 = Math.max(0, Math.floor(((rangeWest + 180) / 360) * n));
      const x2 = Math.min(n - 1, Math.floor(((rangeEast + 180) / 360) * n));
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          urls.add(buildMapTileUrl(z, y, x));
        }
      }
    }
  }
  return [...urls];
}

/** @param {string[]} urls @param {{onProgress?: Function, concurrency?: number, signal?: AbortSignal}} [options] */
export async function preloadUrls(
  urls,
  { onProgress, concurrency = isNative ? 4 : 8, signal } = {},
) {
  const stats = {
    requested: urls.length,
    alreadyCached: 0,
    saved: 0,
    failed: 0,
  };

  throwIfAborted(signal);
  if (urls.length === 0) return stats;
  if (OFFLINE_MAP_ONLY) {
    throw new Error(
      "External tile downloads are disabled by VITE_OFFLINE_MAP_ONLY",
    );
  }

  const webCache =
    !isNative && webSupported
      ? await caches.open(CACHE_NAME).catch(() => null)
      : null;

  // Фильтруем уже скачанные
  let toDownload;
  if (isNative) {
    toDownload = await filterWithConcurrency(urls, concurrency, async (url) => {
      const path = tileFilePath(url);
      return !path || !(await nativeExists(path));
    });
  } else if (webCache) {
    toDownload = await filterWithConcurrency(urls, concurrency, (url) =>
      webCache
        .match(url)
        .then((response) => !response)
        .catch(() => true),
    );
  } else {
    toDownload = urls;
  }

  const total = toDownload.length;
  stats.alreadyCached = urls.length - total;
  if (total === 0) {
    onProgress?.(urls.length, urls.length, stats);
    return stats;
  }

  // Пре-создаём уникальные директории один раз (только для нативного)
  if (isNative) {
    const dirs = new Set(
      toDownload
        .map(tileFilePath)
        .filter(Boolean)
        .map((p) => p.substring(0, p.lastIndexOf("/"))),
    );
    await Promise.all(
      [...dirs].map((dir) =>
        Filesystem.mkdir({
          path: dir,
          directory: Directory.Data,
          recursive: true,
        }).catch(ignoredError("tileCache.removeDirectory")),
      ),
    );
  }

  let done = 0;
  let localSaved = 0;

  const downloadOne = async (url) => {
    throwIfAborted(signal);
    if (isNative) {
      const saved = await nativeWrite(url, true, signal).catch((error) => {
        if (signal?.aborted) throw error;
        return false;
      });
      if (saved) {
        incrementNativeCount();
        localSaved++;
        stats.saved++;
      } else {
        stats.failed++;
      }
    } else if (webCache) {
      const hit = await webCache.match(url).catch(() => null);
      if (hit) {
        stats.alreadyCached++;
      } else {
        try {
          const response = await fetchWithTimeout(url, 10000, signal);
          throwIfAborted(signal);
          if (response.ok) {
            throwIfAborted(signal);
            await webCache.put(url, response);
            touchMetadata(url);
            stats.saved++;
          } else {
            stats.failed++;
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          /* таймаут или сеть — пропускаем */
        }
      }
    } else {
      // Cache Storage refused to open, so there is nowhere to put the tile.
      // Counting it as failed keeps the caller from reporting a preload that
      // stored nothing as a success.
      stats.failed++;
    }
    done++;
    if (done % 5 === 0 || done === total) {
      onProgress?.(stats.alreadyCached + done, urls.length, stats);
    }
  };

  try {
    for (let i = 0; i < toDownload.length; i += concurrency) {
      throwIfAborted(signal);
      const results = await Promise.allSettled(
        toDownload.slice(i, i + concurrency).map(downloadOne),
      );
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
      throwIfAborted(signal);
    }
  } finally {
    // A cancelled native batch may already have written tiles. Reconcile the
    // hard limit after all workers in that batch settle, even on abort.
    if (isNative && localSaved > 0) await enforceNativeQuota();
  }

  stats.failed = Math.max(
    stats.failed,
    stats.requested - stats.alreadyCached - stats.saved,
  );

  if (webCache && stats.saved > 0) {
    throwIfAborted(signal);
    await enforceWebQuota(webCache);
  }

  return stats;
}
