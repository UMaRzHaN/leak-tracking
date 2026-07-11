import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "@/utils/platform";
import { compressImage } from "./compressImage";
import { idb } from "./idb";

const PHOTO_FIELDS = ["photo", "photo_after"];

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

async function cleanupOldVersions(
  folder,
  leakId,
  keepFileName,
  excludeFileNames = new Set(),
) {
  try {
    const { files } = await Filesystem.readdir({
      path: folder,
      directory: Directory.Data,
    });
    const prefix = `photo_${leakId}_`;
    for (const file of files) {
      if (
        file.name.startsWith(prefix) &&
        file.name !== keepFileName &&
        !excludeFileNames.has(file.name)
      ) {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: `${folder}/${file.name}`,
        }).catch(() => {});
      }
    }
  } catch {
    // folder may not exist yet — ok
  }
}

export const PhotoRepository = {
  /**
   * Save a photo blob for a leak.
   * Returns "idb://{key}" on web, "data://{path}" on mobile, or null on failure.
   */
  async save(rawPhoto, { projectId, leakId, folderName }, excludePaths = []) {
    if (!rawPhoto || !leakId) return null;
    const version = Date.now();
    const photo =
      rawPhoto instanceof Blob ? await compressImage(rawPhoto) : rawPhoto;

    /* WEB — IndexedDB */
    if (!isNative) {
      if (!idb.getState().ready || !(photo instanceof Blob) || !projectId)
        return null;

      const photoId = `photo_${projectId}_${leakId}_${version}`;
      const ok = await idb.save(photoId, photo);
      if (!ok) return null;

      const excludeKeys = new Set(
        excludePaths.map((p) => p?.replace("idb://", "")).filter(Boolean),
      );
      const keys = await idb.listKeys();
      const prefix = `photo_${projectId}_${leakId}_`;
      for (const key of keys) {
        if (
          key.startsWith(prefix) &&
          key !== photoId &&
          !excludeKeys.has(key)
        ) {
          await idb.remove(key);
        }
      }

      return `idb://${photoId}`;
    }

    /* MOBILE — Capacitor Filesystem */
    if (!folderName || !(photo instanceof Blob)) return null;

    const folder = getPhotoFolder(folderName);
    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Data,
      recursive: true,
    }).catch(() => {});

    const fileName = `photo_${leakId}_${version}.jpg`;
    const targetPath = `${folder}/${fileName}`;

    const base64 = await fileToBase64(photo);
    await Filesystem.writeFile({
      path: targetPath,
      data: base64,
      directory: Directory.Data,
    });

    const excludeFileNames = new Set(
      excludePaths
        .map((p) => p?.replace(`data://${folder}/`, ""))
        .filter(Boolean),
    );
    await cleanupOldVersions(folder, leakId, fileName, excludeFileNames);

    return `data://${targetPath}`;
  },

  async delete(path) {
    if (!path) return;

    if (path.startsWith("idb://")) {
      if (idb.getState().ready) await idb.remove(path.replace("idb://", ""));
      return;
    }

    if (isNative && path.startsWith("data://")) {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: path.replace("data://", ""),
      }).catch(() => {});
    }
  },

  async get(idbKey) {
    if (!idb.getState().ready || !idbKey) return null;
    return idb.get(idbKey);
  },

  async listKeys() {
    return idb.listKeys();
  },

  async deleteProjectPhotos(projectId) {
    if (!projectId || isNative || !idb.getState().ready) return;
    const keys = await idb.listKeys();
    const prefix = `photo_${projectId}_`;
    for (const key of keys) {
      if (key.startsWith(prefix)) await idb.remove(key);
    }
  },

  /**
   * Delete photos from storage that are not referenced by any leak.
   * Call once after loading project data to clean up orphaned photos.
   */
  async gcOrphaned(leaks, { projectId, folderName }) {
    const referenced = new Set();
    for (const leak of leaks) {
      for (const field of PHOTO_FIELDS) {
        if (leak[field]) referenced.add(leak[field]);
      }
    }

    if (!isNative) {
      if (!idb.getState().ready || !projectId) return;
      const keys = await idb.listKeys();
      const prefix = `photo_${projectId}_`;
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        if (!referenced.has(`idb://${key}`)) await idb.remove(key);
      }
      return;
    }

    if (!folderName) return;
    const folder = getPhotoFolder(folderName);
    try {
      const { files } = await Filesystem.readdir({
        path: folder,
        directory: Directory.Data,
      });
      for (const file of files) {
        const path = `data://${folder}/${file.name}`;
        if (!referenced.has(path)) {
          await Filesystem.deleteFile({
            directory: Directory.Data,
            path: `${folder}/${file.name}`,
          }).catch(() => {});
        }
      }
    } catch {
      // folder not yet created — ok
    }
  },
};
