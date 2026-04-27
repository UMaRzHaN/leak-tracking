import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "../utils/platform";
import { useCallback } from "react";
import { useIndexedDB } from "./useIndexedDB";
import { useProject } from "../app/settings/ProjectContext";
import { compressImage } from "../utils/compressImage";

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

  const PHOTO_FOLDER = activeProject
    ? `LeakReports/${activeProject.folderName}/photos`
    : null;

  /* ================= SAVE ================= */

  const savePhoto = useCallback(async (rawPhoto, leakId) => {
    if (!rawPhoto || !leakId) return null;
    const version = Date.now();
    const photo = rawPhoto instanceof Blob ? await compressImage(rawPhoto) : rawPhoto;

    /* 🌐 WEB — IndexedDB (store raw Blob; avoids ~33% base64 overhead) */
    if (!isNative) {
      if (!ready || !(photo instanceof Blob) || !activeProject?.id) return null;

      // Project-scoped key prevents collisions between projects with same leak_id.
      const photoId = `photo_${activeProject.id}_${leakId}_${version}`;
      const ok = await idbSave(photoId, photo);
      if (!ok) return null;

      if (typeof listKeys === "function") {
        const keys = await listKeys();
        const prefix = `photo_${activeProject.id}_${leakId}_`;
        for (const key of keys) {
          if (key.startsWith(prefix) && key !== photoId) await idbDelete(key);
        }
      }

      return `idb://${photoId}`;
    }

    /* 📱 MOBILE — Directory.Data (Capacitor FS only supports base64 writes) */
    if (!PHOTO_FOLDER || !(photo instanceof Blob)) return null;

    await Filesystem.mkdir({ path: PHOTO_FOLDER, directory: Directory.Data, recursive: true }).catch(() => {});

    const fileName = `photo_${leakId}_${version}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    const base64 = await fileToBase64(photo);
    await Filesystem.writeFile({ path: targetPath, data: base64, directory: Directory.Data });
    await cleanupOldVersions(PHOTO_FOLDER, leakId, fileName);

    return `data://${targetPath}`;
  }, [ready, idbSave, idbDelete, listKeys, isNative, PHOTO_FOLDER, activeProject?.id]);

  /* ================= DELETE ================= */

  const deletePhoto = useCallback(async (path) => {
    if (!path) return;

    if (path.startsWith("idb://")) {
      if (ready) await idbDelete(path.replace("idb://", ""));
      return;
    }

    if (isNative && path.startsWith("data://")) {
      await Filesystem.deleteFile({ directory: Directory.Data, path: path.replace("data://", "") }).catch(() => {});
    }
  }, [ready, idbDelete, isNative]);

  /* ================= GET ================= */

  const getPhoto = useCallback(async (id) => {
    if (!ready || !id) return null;
    return idbGet(id);
  }, [ready, idbGet]);

  /* ================= GC ================= */

  /*
   * Удаляет фото, на которые не ссылается ни одна утечка.
   * Сценарий: пользователь сфотографировал, не сохранил форму → фото осиротело.
   * Вызывать один раз после загрузки данных проекта.
   */
  const gcOrphanedPhotos = useCallback(async (leaks) => {
    const PHOTO_FIELDS = ["photo", "photo_after"];

    const referenced = new Set();
    for (const leak of leaks) {
      for (const field of PHOTO_FIELDS) {
        if (leak[field]) referenced.add(leak[field]);
      }
    }

    if (!isNative) {
      if (!ready) return;
      const keys = await listKeys();
      for (const key of keys) {
        if (!referenced.has(`idb://${key}`)) {
          await idbDelete(key);
        }
      }
      return;
    }

    if (!PHOTO_FOLDER) return;
    try {
      const { files } = await Filesystem.readdir({
        path: PHOTO_FOLDER,
        directory: Directory.Data,
      });
      for (const file of files) {
        const path = `data://${PHOTO_FOLDER}/${file.name}`;
        if (!referenced.has(path)) {
          await Filesystem.deleteFile({
            directory: Directory.Data,
            path: `${PHOTO_FOLDER}/${file.name}`,
          }).catch(() => {});
        }
      }
    } catch {
      // папка ещё не создана — нормально
    }
  }, [ready, listKeys, idbDelete, isNative, PHOTO_FOLDER]);

  return { ready, isNative, savePhoto, deletePhoto, getPhoto, gcOrphanedPhotos };
}
