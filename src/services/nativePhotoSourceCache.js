const MAX_NATIVE_PHOTO_CACHE_BYTES = 8 * 1024 * 1024;

let nativePhotoCacheBytes = 0;
const nativePhotoSrcCache = new Map();
const nativePhotoReadPromises = new Map();
const nativePhotoCacheVersions = new Map();

export function createNativePhotoCacheKey(directory, path) {
  return `${directory}:${path}`;
}

export function getNativePhotoCacheVersion(cacheKey) {
  const version = nativePhotoCacheVersions.get(cacheKey) ?? 0;
  nativePhotoCacheVersions.set(cacheKey, version);
  return version;
}

export function getCachedNativePhoto(cacheKey) {
  const entry = nativePhotoSrcCache.get(cacheKey);
  if (!entry) return null;
  nativePhotoSrcCache.delete(cacheKey);
  nativePhotoSrcCache.set(cacheKey, entry);
  return entry.src;
}

export function cacheNativePhoto(cacheKey, src, expectedVersion) {
  if (getNativePhotoCacheVersion(cacheKey) !== expectedVersion) return false;

  const bytes = src.length * 2;
  if (bytes > MAX_NATIVE_PHOTO_CACHE_BYTES) return false;

  const existing = nativePhotoSrcCache.get(cacheKey);
  if (existing) nativePhotoCacheBytes -= existing.bytes;
  nativePhotoSrcCache.delete(cacheKey);
  nativePhotoSrcCache.set(cacheKey, { src, bytes });
  nativePhotoCacheBytes += bytes;

  while (nativePhotoCacheBytes > MAX_NATIVE_PHOTO_CACHE_BYTES) {
    const oldestKey = nativePhotoSrcCache.keys().next().value;
    const oldest = nativePhotoSrcCache.get(oldestKey);
    nativePhotoSrcCache.delete(oldestKey);
    nativePhotoCacheBytes -= oldest?.bytes ?? 0;
  }

  return true;
}

export function getNativePhotoReadPromise(cacheKey) {
  return nativePhotoReadPromises.get(cacheKey) ?? null;
}

export function setNativePhotoReadPromise(cacheKey, promise) {
  nativePhotoReadPromises.set(cacheKey, promise);
}

export function deleteNativePhotoReadPromise(cacheKey, promise) {
  if (nativePhotoReadPromises.get(cacheKey) === promise) {
    nativePhotoReadPromises.delete(cacheKey);
  }
}

export function invalidateNativePhotoCacheKey(cacheKey) {
  const existing = nativePhotoSrcCache.get(cacheKey);
  if (existing) {
    nativePhotoCacheBytes -= existing.bytes;
    nativePhotoSrcCache.delete(cacheKey);
  }
  nativePhotoReadPromises.delete(cacheKey);
  nativePhotoCacheVersions.set(
    cacheKey,
    (nativePhotoCacheVersions.get(cacheKey) ?? 0) + 1,
  );
}

export function invalidateNativePhotoCachePath(directory, path) {
  invalidateNativePhotoCacheKey(createNativePhotoCacheKey(directory, path));
}

export function invalidateNativePhotoCachePrefix(directory, pathPrefix) {
  const cacheKeyPrefix = createNativePhotoCacheKey(directory, pathPrefix);
  const knownKeys = new Set([
    ...nativePhotoSrcCache.keys(),
    ...nativePhotoReadPromises.keys(),
    ...nativePhotoCacheVersions.keys(),
  ]);

  for (const cacheKey of knownKeys) {
    if (cacheKey.startsWith(cacheKeyPrefix)) {
      invalidateNativePhotoCacheKey(cacheKey);
    }
  }
}

export function clearNativePhotoCache() {
  nativePhotoSrcCache.clear();
  nativePhotoReadPromises.clear();
  nativePhotoCacheVersions.clear();
  nativePhotoCacheBytes = 0;
}
