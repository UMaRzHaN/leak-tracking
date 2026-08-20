import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import { dataUrlToBlob } from "@/utils/photoConversion";
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

/**
 * Фото как Blob, без base64 и без моста.
 *
 * `getPhotoSrc` отдаёт data:URL, потому что этого хочет <img>. Но тому, кто
 * собирает архив или сверяет снимки, нужны байты, и путь через base64 обходится
 * дорого дважды: сначала плагин кодирует файл в строку и передаёт её через мост,
 * потом эту строку разбирают обратно в JS. `convertFileSrc` отдаёт тот же файл
 * по локальному адресу WebView, и `fetch` читает его напрямую — так уже читается
 * принятый архив локальной синхронизации.
 *
 * При любой осечке остаётся прежний путь: терять фото ради скорости незачем.
 */
export async function getPhotoBlob(path) {
  if (!path || !isNative) return null;

  const nativePath = parseNativePhotoPath(path);
  if (!nativePath) return null;

  try {
    const { uri } = await Filesystem.getUri({
      path: nativePath.fsPath,
      directory: nativePath.dir,
    });
    if (typeof uri !== "string" || !uri) {
      throw new Error("Filesystem.getUri returned no URI");
    }
    // Очередь та же, что у чтения через мост: параллельных чтений столько же,
    // сколько их было, — меняется способ, а не нагрузка на память.
    const blob = await queueNativePhotoRead(async () => {
      const response = await fetch(Capacitor.convertFileSrc(uri));
      if (!response.ok) {
        throw new Error(`Photo read failed with ${response.status}`);
      }
      return response.blob();
    });
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("Photo read returned no bytes");
    }
    return blob.type.startsWith("image/")
      ? blob
      : new Blob([blob], { type: "image/jpeg" });
  } catch (error) {
    logger.warn(
      `[photoService] Direct read failed for "${nativePath.fsPath}", falling back to base64`,
      error,
    );
    const src = await getPhotoSrc(path);
    return typeof src === "string" ? dataUrlToBlob(src) : null;
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
