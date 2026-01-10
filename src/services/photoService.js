import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const PHOTO_FOLDER = "LeakReports/photos";

/**
 * Сохраняет base64-фото в Filesystem
 * @param {string} base64 - data:image/...;base64,...
 * @param {string|number} id - id записи
 * @returns {Promise<string>} путь вида Documents/LeakReports/photos/photo_ID.jpg
 */
export async function savePhotoToFS(base64, id) {
  if (!base64 || !id) return null;

  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");

  const fileName = `photo_${id}.jpg`;

  // ✅ СОЗДАЁМ ПАПКУ БЕЗ ПАДЕНИЯ
  try {
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (e) {
    // 📌 папка уже существует — это нормально
  }

  // ✅ ПИШЕМ ФАЙЛ
  await Filesystem.writeFile({
    path: `${PHOTO_FOLDER}/${fileName}`,
    data: cleanBase64,
    directory: Directory.Documents,
    encoding: Encoding.BASE64,
  });

  return `Documents/${PHOTO_FOLDER}/${fileName}`;
}

/**
 * Удаляет фото из Filesystem
 * @param {string} path - Documents/LeakReports/photos/...
 */
export async function deletePhotoFromFS(path) {
  if (!path || !Capacitor.isNativePlatform()) return;

  try {
    const relativePath = path.replace(/^Documents\//, "");

    await Filesystem.deleteFile({
      directory: Directory.Documents,
      path: relativePath,
    });
  } catch (e) {
    console.warn("deletePhotoFromFS error:", e, path);
  }
}

/**
 * Проверяет, существует ли файл
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export async function photoExists(path) {
  if (!path) return false;

  try {
    const fsPath = path.replace(/^Documents\//, "");

    await Filesystem.stat({
      path: fsPath,
      directory: Directory.Documents,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Преобразует путь в src для <img>
 * @param {string} path - Documents/...
 * @returns {string|null}
 */
export async function getPhotoSrc(path) {
  if (!path) return null;

  // ❌ старые данные
  if (path.startsWith("Downloads/")) return null;

  // 🌐 WEB — не поддерживаем
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  // убираем "Documents/"
  const relativePath = path.replace(/^Documents\//, "");

  try {
    const fileUri = await Filesystem.getUri({
      directory: Directory.Documents,
      path: relativePath,
    });

    // ✅ ТОЛЬКО ТАК
    return Capacitor.convertFileSrc(fileUri.uri);
  } catch (e) {
    console.warn("getPhotoSrc error:", e, path);
    return null;
  }
}