import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { buildMapTileUrl } from "@/configs/mapTiles";
const CACHE_NAME = "map-tiles-v2";
const TILE_DIR = "map-tiles";
const MAX_MERCATOR_LAT = 85.05112878;
const NATIVE_COUNT_KEY = "map-tiles-native-count";

const webSupported = typeof caches !== "undefined";

function getNativeCount() {
  const count = Number.parseInt(
    localStorage.getItem(NATIVE_COUNT_KEY) || "0",
    10,
  );
  return Number.isFinite(count) && count > 0 ? count : 0;
}
function incrementNativeCount() {
  localStorage.setItem(NATIVE_COUNT_KEY, getNativeCount() + 1);
}
function resetNativeCount() {
  localStorage.removeItem(NATIVE_COUNT_KEY);
}

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
  return `${TILE_DIR}/${match[1]}/${match[2]}/${match[3]}.jpg`;
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

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { mode: "cors", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
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
    reader.onload = () => resolve(reader.result.split(",")[1]);
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
    return base64ToObjectUrl(data);
  } catch {
    return null;
  }
}

async function nativeWrite(url, skipMkdir = false) {
  const path = tileFilePath(url);
  if (!path || (await nativeExists(path))) return false;
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return false;
    const base64 = await blobToBase64(await response.blob());
    if (!skipMkdir) {
      const dir = path.substring(0, path.lastIndexOf("/"));
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Data,
        recursive: true,
      }).catch(() => {});
    }
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getTileBlobUrl(url) {
  if (isNative) return nativeRead(url);
  if (!webSupported) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    if (!response) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

export async function cacheTile(url, prefetchedResponse = null) {
  if (isNative) {
    const saved = await nativeWrite(url);
    if (saved) incrementNativeCount();
    return;
  }
  if (!webSupported) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(url)) return;
    const response = prefetchedResponse ?? (await fetch(url, { mode: "cors" }));
    if (response.ok) await cache.put(url, response);
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
        path: TILE_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // already empty
    }
    resetNativeCount();
    return;
  }
  if (webSupported) await caches.delete(CACHE_NAME);
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

export async function preloadUrls(
  urls,
  { onProgress, concurrency = isNative ? 4 : 8 } = {},
) {
  const stats = {
    requested: urls.length,
    alreadyCached: 0,
    saved: 0,
    failed: 0,
  };

  if (urls.length === 0) return stats;

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
        }).catch(() => {}),
      ),
    );
  }

  let done = 0;
  let localSaved = 0;

  const downloadOne = async (url) => {
    if (isNative) {
      const saved = await nativeWrite(url, true).catch(() => false);
      if (saved) {
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
          const response = await fetchWithTimeout(url);
          if (response.ok) {
            await webCache.put(url, response);
            stats.saved++;
          } else {
            stats.failed++;
          }
        } catch {
          /* таймаут или сеть — пропускаем */
        }
      }
    }
    done++;
    if (done % 5 === 0 || done === total) {
      onProgress?.(stats.alreadyCached + done, urls.length, stats);
    }
  };

  for (let i = 0; i < toDownload.length; i += concurrency) {
    await Promise.all(toDownload.slice(i, i + concurrency).map(downloadOne));
  }

  stats.failed = Math.max(
    stats.failed,
    stats.requested - stats.alreadyCached - stats.saved,
  );

  if (isNative && localSaved > 0) {
    localStorage.setItem(NATIVE_COUNT_KEY, getNativeCount() + localSaved);
  }

  return stats;
}
