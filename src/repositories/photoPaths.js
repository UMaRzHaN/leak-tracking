import { Filesystem, Directory } from "@capacitor/filesystem";
import { ensureNativeDirectory } from "./nativeDirectory";
import { ignoredError } from "@/utils/ignoredError";
import { invalidateNativePhotoCachePath } from "@/services/storage/nativePhotoSourceCache";
import { encodeStorageKeyPart } from "./PhotoRepository";

// Создание папки просят из нескольких мест сразу; обещание держится, чтобы не
// заводить её дважды.
const photoFolderPromises = new Map();

/** Забыть обещание: папку удалили, и следующий писатель должен создать её заново. */
export function forgetPhotoFolder(folder) {
  photoFolderPromises.delete(folder);
}

/**
 * Где лежит снимок: папка проекта, ключ в базе браузера, путь на устройстве.
 *
 * Отделено от самого хранилища: там читают и пишут файлы, а здесь только
 * считают адреса и убирают прежние версии. Приведение путей к проекту нужно
 * потому, что снимок, приехавший из чужого архива, помнит чужую папку.
 */
export function getPhotoFolder(folderName) {
  return `LeakReports/${folderName}/photos`;
}
export function isDirectPhotoVersion(
  value,
  prefix,
  { extension = false } = {},
) {
  if (!String(value).startsWith(prefix)) return false;
  const suffix = String(value).slice(prefix.length);
  return (
    extension
      ? /^(?:\d+(?:_\d+)?|h_[a-f0-9]{24,64})\.jpg$/
      : /^(?:\d+(?:_\d+)?|h_[a-f0-9]{24,64})$/
  ).test(suffix);
}
export function getScopedWebPhotoKey(path, projectId) {
  if (
    projectId == null ||
    String(projectId).length === 0 ||
    !String(path).startsWith("idb://")
  ) {
    return null;
  }
  const key = String(path).slice("idb://".length);
  const projectPart = encodeStorageKeyPart(projectId);
  return key.startsWith(`photo_${projectPart}_`) ? key : null;
}

export function getScopedNativePhotoPath(path, folderName) {
  if (!folderName || !String(path).startsWith("data://")) return null;
  const value = String(path).slice("data://".length);
  const prefix = `${getPhotoFolder(folderName)}/`;
  if (!value.startsWith(prefix)) return null;

  const fileName = value.slice(prefix.length);
  if (
    !fileName ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !fileName.startsWith("photo_") ||
    !/\.jpg$/i.test(fileName)
  ) {
    return null;
  }
  return value;
}

export function ensurePhotoFolder(folderName) {
  if (!folderName) return Promise.resolve(null);

  const folder = getPhotoFolder(folderName);
  if (!photoFolderPromises.has(folder)) {
    const pending = ensureNativeDirectory(folder, Directory.Data)
      .catch((error) => {
        photoFolderPromises.delete(folder);
        throw error;
      })
      .then(() => folder);
    photoFolderPromises.set(folder, pending);
  }

  return photoFolderPromises.get(folder);
}

export async function cleanupOldVersions(
  folder,
  leakPart,
  keepFileName,
  excludeFileNames = new Set(),
) {
  try {
    const { files } = await Filesystem.readdir({
      path: folder,
      directory: Directory.Data,
    });
    const prefix = `photo_${leakPart}_`;
    for (const file of files) {
      if (
        isDirectPhotoVersion(file.name, prefix, { extension: true }) &&
        file.name !== keepFileName &&
        !excludeFileNames.has(file.name)
      ) {
        const stalePath = `${folder}/${file.name}`;
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: stalePath,
        })
          .then(() => invalidateNativePhotoCachePath(Directory.Data, stalePath))
          .catch(ignoredError("photos.deleteStale"));
      }
    }
  } catch {
    // folder may not exist yet — ok
  }
}
