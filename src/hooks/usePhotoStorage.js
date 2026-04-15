import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { useIndexedDB } from "./useIndexedDB";
import { useProject } from "../app/settings/ProjectContext";

/*
 * Фото хранятся в Directory.Data (приватное) — не видно в галерее.
 * Мобильная структура:
 *   LeakReports/{folderName}/photos/photo_{leakId}_{ts}.jpg
 */

/* ================= HELPERS ================= */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r !== "string") { reject(new Error("FileReader result is not string")); return; }
      resolve(r.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function cleanupOldVersions(folder, leakId, keepFileName) {
  try {
    const { files } = await Filesystem.readdir({ path: folder, directory: Directory.Data });
    const prefix = `photo_${leakId}_`;
    for (const file of files) {
      if (file.name.startsWith(prefix) && file.name !== keepFileName) {
        await Filesystem.deleteFile({ directory: Directory.Data, path: `${folder}/${file.name}` }).catch(() => {});
      }
    }
  } catch {
    // папка может не существовать — нормально
  }
}

/* ================= HOOK ================= */

export function usePhotoStorage() {
  const { ready, savePhoto: idbSave, getPhoto: idbGet, deletePhoto: idbDelete, listKeys } = useIndexedDB();
  const { activeProject } = useProject();

  const isNative = Capacitor.isNativePlatform();
  const PHOTO_FOLDER = activeProject
    ? `LeakReports/${activeProject.folderName}/photos`
    : null;

  /* ================= SAVE ================= */

  async function savePhoto(rawPhoto, leakId) {
    if (!rawPhoto || !leakId) return null;
    const version = Date.now();

    /* 🌐 WEB — IndexedDB */
    if (!isNative) {
      if (!ready || !(rawPhoto instanceof Blob)) return null;

      const base64 = await fileToBase64(rawPhoto);
      const mime = rawPhoto.type || "image/jpeg";
      const photoId = `photo_${leakId}_${version}`;
      const ok = await idbSave(photoId, `data:${mime};base64,${base64}`);
      if (!ok) return null;

      if (typeof listKeys === "function") {
        const keys = await listKeys();
        const prefix = `photo_${leakId}_`;
        for (const key of keys) {
          if (key.startsWith(prefix) && key !== photoId) await idbDelete(key);
        }
      }

      return `idb://${photoId}`;
    }

    /* 📱 MOBILE — Directory.Data */
    if (!PHOTO_FOLDER || !(rawPhoto instanceof Blob)) return null;

    await Filesystem.mkdir({ path: PHOTO_FOLDER, directory: Directory.Data, recursive: true }).catch(() => {});

    const fileName = `photo_${leakId}_${version}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    const base64 = await fileToBase64(rawPhoto);
    await Filesystem.writeFile({ path: targetPath, data: base64, directory: Directory.Data });
    await cleanupOldVersions(PHOTO_FOLDER, leakId, fileName);

    return `data://${targetPath}`;
  }

  /* ================= DELETE ================= */

  async function deletePhoto(path) {
    if (!path) return;

    if (path.startsWith("idb://")) {
      if (ready) await idbDelete(path.replace("idb://", ""));
      return;
    }

    if (isNative && path.startsWith("data://")) {
      await Filesystem.deleteFile({ directory: Directory.Data, path: path.replace("data://", "") }).catch(() => {});
    }
  }

  /* ================= GET ================= */

  async function getPhoto(id) {
    if (!ready || !id) return null;
    return idbGet(id);
  }

  return { ready, isNative, savePhoto, deletePhoto, getPhoto };
}
