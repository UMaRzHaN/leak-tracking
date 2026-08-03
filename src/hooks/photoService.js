import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import {
  cacheNativePhoto,
  createNativePhotoCacheKey,
  deleteNativePhotoReadPromise,
  getCachedNativePhoto,
  getNativePhotoCacheVersion,
  getNativePhotoReadPromise,
  invalidateNativePhotoCachePath,
  setNativePhotoReadPromise,
} from "@/services/storage/nativePhotoSourceCache";

/*
 * Все фото хранятся в Directory.Data (приватное хранилище приложения).
 * Путь в БД использует префикс "data://" для нативных фото.
 */

const MAX_CONCURRENT_NATIVE_PHOTO_READS = 3;
let activeNativePhotoReads = 0;
const nativePhotoReadQueue = [];

function drainNativePhotoReadQueue() {
  while (
    activeNativePhotoReads < MAX_CONCURRENT_NATIVE_PHOTO_READS &&
    nativePhotoReadQueue.length > 0
  ) {
    const { task, resolve, reject } = nativePhotoReadQueue.shift();
    activeNativePhotoReads += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeNativePhotoReads -= 1;
        drainNativePhotoReadQueue();
      });
  }
}

function queueNativePhotoRead(task) {
  return new Promise((resolve, reject) => {
    nativePhotoReadQueue.push({ task, resolve, reject });
    drainNativePhotoReadQueue();
  });
}

/* =======================
   🖼 SRC
======================= */
function parseNativePhotoPath(path) {
  if (typeof path !== "string") return null;

  const isDataPath = path.startsWith("data://");
  const prefix = isDataPath ? "data://" : "Documents/";
  if (!path.startsWith(prefix)) return null;

  const fsPath = path.slice(prefix.length);
  const segments = fsPath.split("/");
  if (
    !fsPath.startsWith("LeakReports/") ||
    fsPath.includes("\\") ||
    [...fsPath].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    }) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return {
    fsPath,
    dir: isDataPath ? Directory.Data : Directory.Documents,
  };
}

export async function getPhotoSrc(path) {
  if (!path) return null;

  if (!isNative) {
    return path;
  }

  const nativePath = parseNativePhotoPath(path);
  if (!nativePath) return null;

  const cacheKey = createNativePhotoCacheKey(nativePath.dir, nativePath.fsPath);
  const cached = getCachedNativePhoto(cacheKey);
  if (cached) return cached;

  try {
    let pending = getNativePhotoReadPromise(cacheKey);
    if (!pending) {
      const cacheVersion = getNativePhotoCacheVersion(cacheKey);
      pending = queueNativePhotoRead(() =>
        Filesystem.readFile({
          path: nativePath.fsPath,
          directory: nativePath.dir,
        }),
      )
        .then((file) => {
          const src = `data:image/jpeg;base64,${file.data}`;
          cacheNativePhoto(cacheKey, src, cacheVersion);
          return src;
        })
        .finally(() => deleteNativePhotoReadPromise(cacheKey, pending));
      setNativePhotoReadPromise(cacheKey, pending);
    }
    return await pending;
  } catch (err) {
    logger.error(
      `[photoService] Failed to read photo "${nativePath.fsPath}":`,
      err,
    );
    return null;
  }
}

/* =======================
   📌 EXISTS
======================= */
export async function photoExists(path) {
  if (!path) return false;

  if (!isNative) {
    return typeof path === "string" && path.startsWith("data:image/");
  }

  const nativePath = parseNativePhotoPath(path);
  if (!nativePath) return false;

  try {
    await Filesystem.stat({
      directory: nativePath.dir,
      path: nativePath.fsPath,
    });
    return true;
  } catch {
    return false;
  }
}

/* =======================
   🗑 DELETE
======================= */
export async function deletePhotoFromFS(path) {
  if (!path || !isNative) return;

  const nativePath = parseNativePhotoPath(path);
  if (!nativePath) return;

  try {
    await Filesystem.deleteFile({
      directory: nativePath.dir,
      path: nativePath.fsPath,
    });
  } catch {
    // файл уже удалён — нормально
  } finally {
    invalidateNativePhotoCachePath(nativePath.dir, nativePath.fsPath);
  }
}
