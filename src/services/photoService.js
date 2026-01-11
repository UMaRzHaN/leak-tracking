import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const PHOTO_FOLDER = "LeakReports/photos";

/**
 * 💾 Сохраняет фото по URI (CameraResultType.Uri)
 * @param {object} photo - объект от Camera.getPhoto()
 * @param {string|number} id
 * @returns {Promise<string>} Documents/LeakReports/photos/photo_ID.jpg
 */
export async function savePhotoToFS(photo, id) {
  if (!photo?.path || !id) return null;

  try {
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });

    const fileName = `photo_${id}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    await Filesystem.copy({
      from: photo.path, // ← content:// или file://
      to: targetPath,
      directory: Directory.Documents,
    });

    return `Documents/${targetPath}`;
  } catch (e) {
    console.error("savePhotoToFS error:", e);
    return null;
  }
}

/**
 * 🗑 Удаляет фото
 */
export async function deletePhotoFromFS(path) {
  if (!path || !Capacitor.isNativePlatform()) return;

  try {
    await Filesystem.deleteFile({
      directory: Directory.Documents,
      path: path.replace(/^Documents\//, ""),
    });
  } catch (e) {
    console.warn("deletePhotoFromFS error:", e, path);
  }
}

/**
 * 📌 Проверяет существование файла
 */
export async function photoExists(path) {
  if (!path) return false;

  try {
    await Filesystem.stat({
      directory: Directory.Documents,
      path: path.replace(/^Documents\//, ""),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 🖼 Преобразует путь в src для <img>
 */
export async function getPhotoSrc(path) {
  if (!path || !Capacitor.isNativePlatform()) return null;
  if (path.startsWith("Downloads/")) return null;

  try {
    const { uri } = await Filesystem.getUri({
      directory: Directory.Documents,
      path: path.replace(/^Documents\//, ""),
    });

    return Capacitor.convertFileSrc(uri);
  } catch (e) {
    console.warn("getPhotoSrc error:", e, path);
    return null;
  }
}
