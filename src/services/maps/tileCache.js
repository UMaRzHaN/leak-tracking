const CACHE_NAME = "map-tiles-v2";
const supported = typeof caches !== "undefined";
const ESRI_BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

function norm(url) { return url; }

export async function getTileBlobUrl(url) {
  if (!supported) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(norm(url));
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function cacheTile(url) {
  if (!supported) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = norm(url);
    if (await cache.match(key)) return;
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) await cache.put(key, response);
  } catch {
    // quota exceeded or network error — ignore silently
  }
}

export async function getMapCacheInfo() {
  if (!supported) return { count: 0, sizeMB: 0 };
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const sizeMB = Math.round(keys.length * 40 / 1024 * 10) / 10;
    return { count: keys.length, sizeMB };
  } catch {
    return { count: 0, sizeMB: 0 };
  }
}

export async function clearMapCache() {
  if (!supported) return;
  await caches.delete(CACHE_NAME);
}

export async function preloadArea(lat, lng, { minZoom = 13, maxZoom = 17, onProgress } = {}) {
  if (!supported) return 0;

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

  const cache = await caches.open(CACHE_NAME);
  let done = 0;

  for (const url of urls) {
    if (await cache.match(url)) {
      done++;
      onProgress?.(done, urls.length);
      continue;
    }
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      // skip individual tile failures
    }
    done++;
    onProgress?.(done, urls.length);
    if (done % 20 === 0) await new Promise((r) => setTimeout(r, 100));
  }

  return done;
}
