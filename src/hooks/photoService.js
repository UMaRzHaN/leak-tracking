import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/*
 * Все фото хранятся в Directory.Data (приватное хранилище приложения).
 * Путь в БД использует префикс "data://" для нативных фото.
 */

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

  try {
    const file = await Filesystem.readFile({
      path: nativePath.fsPath,
      directory: nativePath.dir,
    });

    // file.data — base64 строка
    return `data:image/jpeg;base64,${file.data}`;
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
  }
}
