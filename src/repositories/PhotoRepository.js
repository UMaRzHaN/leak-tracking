import { Filesystem, Directory } from "@capacitor/filesystem";
import { asOutOfSpaceError } from "@/services/storage/outOfSpace";
import { isNative } from "@/utils/platform";
import { compressImage, isWithinPhotoBudget } from "./compressImage";
import { idb } from "./idb";
import { ensureNativeDirectory } from "./nativeDirectory";
import { isPhotoPrepared } from "@/utils/photoPreparation";
import {
  invalidateNativePhotoCachePath,
  invalidateNativePhotoCachePrefix,
} from "@/services/storage/nativePhotoSourceCache";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { ignoredError } from "@/utils/ignoredError";

const photoFolderPromises = new Map();
let lastPhotoTimestamp = 0;
let photoTimestampSequence = 0;

const getStoredPhoto = (key) => (idb.getStrict ?? idb.get)(key);
const listStoredPhotoKeys = () => (idb.listKeysStrict ?? idb.listKeys)();

export function encodeStorageKeyPart(value) {
  const text = String(value ?? "");
  const wellFormed =
    typeof text.toWellFormed === "function"
      ? text.toWellFormed()
      : text.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
  return encodeURIComponent(wellFormed).replace(
    /[_.]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function createPhotoVersion() {
  const timestamp = Date.now();
  if (timestamp === lastPhotoTimestamp) {
    photoTimestampSequence += 1;
    return `${timestamp}_${photoTimestampSequence}`;
  }
  lastPhotoTimestamp = timestamp;
  photoTimestampSequence = 0;
  return String(timestamp);
}

function collectReferencedPhotos(leaks = []) {
  const referenced = new Set();
  for (const leak of leaks) {
    for (const field of LEAK_PHOTO_FIELDS) {
      if (leak[field]) referenced.add(leak[field]);
    }

    if (Array.isArray(leak.monitoringRecords)) {
      for (const record of leak.monitoringRecords) {
        for (const field of MONITORING_PHOTO_FIELDS) {
          if (record?.[field]) referenced.add(record[field]);
        }
      }
    }

    // Лента событий обходится наравне со списком обходов, а не вместо него.
    // Пока обе формы живут рядом, снимок может числиться только в одной из
    // них, и пропуск любой означает удаление живого фото как бесхозного.
    if (Array.isArray(leak.events)) {
      for (const event of leak.events) {
        for (const field of EVENT_PHOTO_FIELDS) {
          if (event?.[field]) referenced.add(event[field]);
        }
      }
    }
  }
  return referenced;
}

// Compression is skipped for a photo that is already inside the storage budget.
// On Android that is the difference between a full JPEG decode plus canvas
// re-encode per imported photo and a header read of a few hundred bytes, and
// re-importing the app's own export hits this path for every photo in the file.
async function preparePhotoBlob(rawPhoto) {
  if (!(rawPhoto instanceof Blob)) return rawPhoto;
  if (isPhotoPrepared(rawPhoto)) return rawPhoto;
  if (await isWithinPhotoBudget(rawPhoto)) return rawPhoto;
  return compressImage(rawPhoto);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("FileReader result is not string"));
        return;
      }
      resolve(r.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getPhotoFolder(folderName) {
  return `LeakReports/${folderName}/photos`;
}

function isDirectPhotoVersion(value, prefix, { extension = false } = {}) {
  if (!String(value).startsWith(prefix)) return false;
  const suffix = String(value).slice(prefix.length);
  return (
    extension
      ? /^(?:\d+(?:_\d+)?|h_[a-f0-9]{24,64})\.jpg$/
      : /^(?:\d+(?:_\d+)?|h_[a-f0-9]{24,64})$/
  ).test(suffix);
}

function normalizeContentHash(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{24,64}$/.test(normalized) ? normalized : null;
}

function getScopedWebPhotoKey(path, projectId) {
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

function getScopedNativePhotoPath(path, folderName) {
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

function ensurePhotoFolder(folderName) {
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

async function cleanupOldVersions(
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

export const PhotoRepository = {
  /** @param {{folderName?: string}} [options] */
  async prepare({ folderName } = {}) {
    if (!isNative || !folderName) return;
    await ensurePhotoFolder(folderName);
  },

  /**
   * Save a photo blob for a leak.
   * Returns "idb://{key}" on web, "data://{path}" on mobile, or null on failure.
   */
  async save(
    rawPhoto,
    { projectId, leakId, folderName },
    excludePaths = [],
    {
      cleanupOldVersions: shouldCleanupOldVersions = true,
      contentHash: rawContentHash = /** @type {string|null} */ (null),
      returnMetadata = false,
    } = {},
  ) {
    if (!rawPhoto || leakId == null || String(leakId).length === 0) return null;
    const contentHash = normalizeContentHash(rawContentHash);
    const version = contentHash ? `h_${contentHash}` : createPhotoVersion();
    const leakPart = encodeStorageKeyPart(leakId);

    /* WEB — IndexedDB */
    if (!isNative) {
      if (
        !idb.getState().ready ||
        projectId == null ||
        String(projectId).length === 0
      )
        return null;

      const projectPart = encodeStorageKeyPart(projectId);
      const photoId = `photo_${projectPart}_${leakPart}_${version}`;
      // Content-addressed imports can return the existing object before image
      // compression, avoiding a large temporary canvas/blob allocation.
      if (contentHash && (await getStoredPhoto(photoId))) {
        const path = `idb://${photoId}`;
        return returnMetadata ? { path, created: false } : path;
      }
      const photo = await preparePhotoBlob(rawPhoto);
      if (!(photo instanceof Blob)) return null;

      const ok = await idb.save(photoId, photo);
      if (!ok) return null;

      if (!shouldCleanupOldVersions) {
        const path = `idb://${photoId}`;
        return returnMetadata ? { path, created: true } : path;
      }

      const excludeKeys = new Set(
        excludePaths.map((p) => p?.replace("idb://", "")).filter(Boolean),
      );
      const keys = await listStoredPhotoKeys();
      const prefix = `photo_${projectPart}_${leakPart}_`;
      for (const key of keys) {
        if (
          isDirectPhotoVersion(key, prefix) &&
          key !== photoId &&
          !excludeKeys.has(key)
        ) {
          await idb.remove(key);
        }
      }

      const path = `idb://${photoId}`;
      return returnMetadata ? { path, created: true } : path;
    }

    /* MOBILE — Capacitor Filesystem */
    if (!folderName) return null;

    const folder = await ensurePhotoFolder(folderName);

    const fileName = `photo_${leakPart}_${version}.jpg`;
    const targetPath = `${folder}/${fileName}`;

    if (contentHash) {
      try {
        await Filesystem.stat({ path: targetPath, directory: Directory.Data });
        const path = `data://${targetPath}`;
        return returnMetadata ? { path, created: false } : path;
      } catch {
        // The content-addressed file does not exist yet.
      }
    }

    const photo = await preparePhotoBlob(rawPhoto);
    if (!(photo instanceof Blob)) return null;

    const base64 = await fileToBase64(photo);
    try {
      await Filesystem.writeFile({
        path: targetPath,
        data: base64,
        directory: Directory.Data,
      });
    } catch (error) {
      // Кончившееся место приходит текстом системной ошибки; помечаем кодом,
      // чтобы экран показал «освободите место», а не общий отказ записи.
      throw asOutOfSpaceError(error);
    }

    const excludeFileNames = new Set(
      excludePaths
        .map((p) => p?.replace(`data://${folder}/`, ""))
        .filter(Boolean),
    );
    if (shouldCleanupOldVersions) {
      await cleanupOldVersions(folder, leakPart, fileName, excludeFileNames);
    }

    const path = `data://${targetPath}`;
    return returnMetadata ? { path, created: true } : path;
  },

  /** @param {string} path @param {{projectId?: string, folderName?: string}} [options] */
  async delete(path, { projectId, folderName } = {}) {
    if (!path) return false;

    if (path.startsWith("idb://")) {
      const key = getScopedWebPhotoKey(path, projectId);
      if (!key || !idb.getState().ready) return false;
      return idb.remove(key);
    }

    if (isNative && path.startsWith("data://")) {
      const scopedPath = getScopedNativePhotoPath(path, folderName);
      if (!scopedPath) return false;
      try {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: scopedPath,
        });
        return true;
      } finally {
        invalidateNativePhotoCachePath(Directory.Data, scopedPath);
      }
    }

    return false;
  },

  async get(idbKey) {
    if (!idb.getState().ready || !idbKey) return null;
    return getStoredPhoto(idbKey);
  },

  async listKeys() {
    return listStoredPhotoKeys();
  },

  async deleteProjectPhotos(projectId, folderName) {
    if (isNative) {
      if (folderName) {
        const folder = getPhotoFolder(folderName);
        photoFolderPromises.delete(folder);
        invalidateNativePhotoCachePrefix(Directory.Data, `${folder}/`);
      }
      return;
    }
    if (
      projectId == null ||
      String(projectId).length === 0 ||
      !idb.getState().ready
    ) {
      return;
    }
    const keys = await listStoredPhotoKeys();
    const prefix = `photo_${encodeStorageKeyPart(projectId)}_`;
    const failedKeys = [];
    for (const key of keys) {
      if (key.startsWith(prefix) && (await idb.remove(key)) === false) {
        failedKeys.push(key);
      }
    }
    if (failedKeys.length) {
      const error = new Error(
        `Could not delete ${failedKeys.length} project photo(s)`,
      );
      error.code = "PHOTO_DELETE_FAILED";
      error.failedKeys = failedKeys;
      throw error;
    }
  },

  /**
   * Убирает снимки, на которые никто не ссылается.
   *
   * Порядок здесь — не деталь реализации, а собственно защита. Сначала
   * составляется список того, что **уже лежит**, и только потом спрашивается,
   * кто на что ссылается. Наоборот было нельзя: между сбором ссылок и
   * удалением помещается сохранение, и снимок, сделанный ровно в это окно,
   * объявлялся сиротой и удалялся — карточку реестра фотографировали посреди
   * обхода, а уборка шла в это же время фоном, на первом простое после
   * загрузки проекта.
   *
   * При нынешнем порядке снимок, появившийся после составления списка, в
   * список не попал и удалён быть не может; а владелец, появившийся после
   * него, попадёт в ссылки, потому что их спрашивают позже. Оба случая
   * закрыты порядком, а не сверкой времени.
   *
   * Остаётся один узкий случай, который порядком не лечится: на устройстве
   * файл снимка адресуется содержимым, и карточка, снятая заново ровно тем же
   * кадром, переиспользует уже лежащий файл. Если тот к началу уборки был
   * сиротой, он уйдёт вместе с новой ссылкой на него. Нужны совпадение байт в
   * байт и попадание в то же окно; чинится это не здесь, а тем, чтобы уборка
   * и запись не шли одновременно.
   *
   * @param {() => Promise<Record<string, any>[]|null>} collectOwners
   *   Спрашивается **после** составления списка. `null` — «ответить не смогли»
   *   (например, не прочитался реестр компонентов): тогда не убирается ничего,
   *   потому что молчание владельца — не то же самое, что отсутствие ссылок.
   * @param {{projectId?: string, folderName?: string}} options
   */
  async gcOrphaned(collectOwners, { projectId, folderName }) {
    if (typeof collectOwners !== "function") {
      throw new TypeError(
        "gcOrphaned requires a collector so owners are read after the listing",
      );
    }

    if (!isNative) {
      if (
        !idb.getState().ready ||
        projectId == null ||
        String(projectId).length === 0
      ) {
        return;
      }
      const prefix = `photo_${encodeStorageKeyPart(projectId)}_`;
      const stored = (await listStoredPhotoKeys()).filter((key) =>
        key.startsWith(prefix),
      );

      const owners = await collectOwners();
      if (!owners) return;
      const referenced = collectReferencedPhotos(owners);

      const failedKeys = [];
      for (const key of stored) {
        if (
          !referenced.has(`idb://${key}`) &&
          (await idb.remove(key)) === false
        ) {
          failedKeys.push(key);
        }
      }
      if (failedKeys.length) {
        const error = new Error(
          `Could not delete ${failedKeys.length} orphaned photo(s)`,
        );
        error.code = "PHOTO_DELETE_FAILED";
        error.failedKeys = failedKeys;
        throw error;
      }
      return;
    }

    if (!folderName) return;
    const folder = getPhotoFolder(folderName);
    let stored;
    try {
      stored = (
        await Filesystem.readdir({ path: folder, directory: Directory.Data })
      ).files;
    } catch {
      // folder not yet created — ok
      return;
    }

    const owners = await collectOwners();
    if (!owners) return;
    const referenced = collectReferencedPhotos(owners);

    for (const file of stored) {
      const path = `data://${folder}/${file.name}`;
      if (referenced.has(path)) continue;
      const orphanPath = `${folder}/${file.name}`;
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: orphanPath,
      })
        .catch(ignoredError("photos.deleteOrphan"))
        .finally(() =>
          invalidateNativePhotoCachePath(Directory.Data, orphanPath),
        );
    }
  },
};
