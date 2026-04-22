import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

const isNative = Capacitor.isNativePlatform();
const CACHE_NAME = "map-tiles-v2";
const TILE_DIR = "map-tiles";
const ESRI_BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

const webSupported = typeof caches !== "undefined";

// ── Helpers ──────────────────────────────────────────────────────────────────

function tileFilePath(url) {
  const match = url.match(/\/tile\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) return null;
  return `${TILE_DIR}/${match[1]}/${match[2]}/${match[3]}.jpg`;
}

export function buildTileUrls(lat, lng, minZoom, maxZoom) {
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const cx = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const cy = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    const radius = z <= 13 ? 2 : z <= 14 ? 3 : z <= 15 ? 4 : z <= 16 ? 5 : 6;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        urls.push(`${ESRI_BASE}/${z}/${y}/${x}`);
      }
    }
  }
  return urls;
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
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return base64ToObjectUrl(data);
  } catch {
    return null;
  }
}

async function nativeWrite(url) {
  const path = tileFilePath(url);
  if (!path || (await nativeExists(path))) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const base64 = await blobToBase64(await response.blob());
    const dir = path.substring(0, path.lastIndexOf("/"));
    await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data });
  } catch {
    // network error or quota — ignore
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
  if (isNative) return nativeWrite(url);
  if (!webSupported) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(url)) return;
    const response = prefetchedResponse ?? await fetch(url, { mode: "cors" });
    if (response.ok) await cache.put(url, response);
  } catch {
    // ignore
  }
}

export async function getMapCacheInfo() {
  if (isNative) return { count: 0, sizeMB: 0 }; // подсчёт файлов на FS слишком дорог
  if (!webSupported) return { count: 0, sizeMB: 0 };
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const sizeMB = Math.round((keys.length * 40) / 1024 * 10) / 10;
    return { count: keys.length, sizeMB };
  } catch {
    return { count: 0, sizeMB: 0 };
  }
}

export async function clearMapCache() {
  if (isNative) {
    try {
      await Filesystem.rmdir({ path: TILE_DIR, directory: Directory.Data, recursive: true });
    } catch {
      // already empty
    }
    return;
  }
  if (webSupported) await caches.delete(CACHE_NAME);
}

export function buildViewportTileUrls(bounds, minZoom, maxZoom) {
  const { north, south, east, west } = bounds;
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const x1 = Math.max(0, Math.floor(((west + 180) / 360) * n));
    const x2 = Math.min(n - 1, Math.floor(((east + 180) / 360) * n));
    const latRad1 = (north * Math.PI) / 180;
    const y1 = Math.max(0, Math.floor(((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n));
    const latRad2 = (south * Math.PI) / 180;
    const y2 = Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n));
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        urls.push(`${ESRI_BASE}/${z}/${y}/${x}`);
      }
    }
  }
  return urls;
}

export async function preloadUrls(urls, { onProgress, concurrency = 6 } = {}) {
  const total = urls.length;
  if (total === 0) return;

  let done = 0;
  const webCache = (!isNative && webSupported) ? await caches.open(CACHE_NAME).catch(() => null) : null;

  const downloadOne = async (url) => {
    if (isNative) {
      const path = tileFilePath(url);
      const cached = path ? await nativeExists(path) : false;
      if (!cached) await nativeWrite(url);
    } else if (webCache) {
      const hit = await webCache.match(url).catch(() => null);
      if (!hit) {
        try {
          const response = await fetch(url, { mode: "cors" });
          if (response.ok) await webCache.put(url, response);
        } catch { /* skip */ }
      }
    }
    done++;
    if (done % 5 === 0 || done === total) onProgress?.(done, total);
  };

  for (let i = 0; i < urls.length; i += concurrency) {
    await Promise.all(urls.slice(i, i + concurrency).map(downloadOne));
  }
}

export async function preloadArea(lat, lng, { minZoom = 13, maxZoom = 16, onProgress } = {}) {
  const urls = buildTileUrls(lat, lng, minZoom, maxZoom);
  let done = 0;
  const CONCURRENCY = 6;

  const webCache = (!isNative && webSupported) ? await caches.open(CACHE_NAME).catch(() => null) : null;

  const downloadOne = async (url) => {
    if (isNative) {
      const path = tileFilePath(url);
      const cached = path ? await nativeExists(path) : false;
      if (!cached) await nativeWrite(url);
    } else if (webCache) {
      const hit = await webCache.match(url).catch(() => null);
      if (!hit) {
        try {
          const response = await fetch(url, { mode: "cors" });
          if (response.ok) await webCache.put(url, response);
        } catch {
          // skip failed tile
        }
      }
    }
    done++;
    onProgress?.(done, urls.length);
  };

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    await Promise.all(urls.slice(i, i + CONCURRENCY).map(downloadOne));
  }

  return done;
}
