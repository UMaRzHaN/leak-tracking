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
export async function getPhotoSrc(path) {
  if (!path) return null;

  if (!isNative) {
    return path;
  }

  // Нативный путь: data://LeakReports/...
  const fsPath = path.startsWith("data://")
    ? path.replace("data://", "")
    : path.replace(/^Documents\//, ""); // обратная совместимость со старыми путями

  const dir = path.startsWith("data://") ? Directory.Data : Directory.Documents;

  try {
    const file = await Filesystem.readFile({
      path: fsPath,
      directory: dir,
    });

    // file.data — base64 строка
    return `data:image/jpeg;base64,${file.data}`;
  } catch (err) {
    logger.error(`[photoService] Failed to read photo "${fsPath}":`, err);
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

  const fsPath = path.startsWith("data://")
    ? path.replace("data://", "")
    : path.replace(/^Documents\//, "");

  const dir = path.startsWith("data://") ? Directory.Data : Directory.Documents;

  try {
    await Filesystem.stat({ directory: dir, path: fsPath });
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

  const fsPath = path.startsWith("data://")
    ? path.replace("data://", "")
    : path.replace(/^Documents\//, "");

  const dir = path.startsWith("data://") ? Directory.Data : Directory.Documents;

  try {
    await Filesystem.deleteFile({ directory: dir, path: fsPath });
  } catch {
    // файл уже удалён — нормально
  }
}
