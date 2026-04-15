import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { useIndexedDB } from "./useIndexedDB";
import { getProjectMobileDir } from "../constants/storage.constants";
import { useProject } from "../app/settings/ProjectContext";

/*
 * Фотографии сохраняются в Directory.Data — приватное хранилище приложения,
 * которое НЕ индексируется галереей и НЕ видно пользователю в файловом менеджере.
 * Это исключает случай, когда пользователь удаляет фото из галереи и оно
 * пропадает и из проекта.
 */

/* ================= HELPERS ================= */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader result is not string"));
        return;
      }
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function cleanupOldPhotoVersions(folder, leakId, keepFileName) {
  try {
    const { files } = await Filesystem.readdir({
      path: folder,
      directory: Directory.Data,
    });

    const prefix = `photo_${leakId}_`;

    for (const file of files) {
      if (file.name.startsWith(prefix) && file.name !== keepFileName) {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: `${folder}/${file.name}`,
        }).catch(() => {});
      }
    }
  } catch {
    // папка может не существовать — нормально
  }
}

/* ================= HOOK ================= */

export function usePhotoStorage() {
  const {
    ready,
    savePhoto: saveToIndexedDB,
    getPhoto: getFromIndexedDB,
    deletePhoto: deleteFromIndexedDB,
    listKeys,
  } = useIndexedDB();

  const { project } = useProject();
  const baseDir = getProjectMobileDir(project);
  const PHOTO_FOLDER = `${baseDir}/photos`;

  const isNative = Capacitor.isNativePlatform();

  /* ================= SAVE ================= */

  async function savePhoto(rawPhoto, leakId) {
    if (!rawPhoto || !leakId) return null;

    const version = Date.now();

    /* =================
       🌐 WEB (IndexedDB)
    ================= */
    if (!isNative) {
      if (!ready) return null;

      if (!(rawPhoto instanceof Blob)) return null;

      const base64 = await fileToBase64(rawPhoto);
      const mime = rawPhoto.type || "image/jpeg";
      const photoId = `photo_${leakId}_${version}`;
      const photoData = `data:${mime};base64,${base64}`;

      const ok = await saveToIndexedDB(photoId, photoData);
      if (!ok) return null;

      // Удаляем старые версии (WEB)
      if (typeof listKeys === "function") {
        const keys = await listKeys();
        const prefix = `photo_${leakId}_`;
        for (const key of keys) {
          if (key.startsWith(prefix) && key !== photoId) {
            await deleteFromIndexedDB(key);
          }
        }
      }

      return `idb://${photoId}`;
    }

    /* =================
       📱 MOBILE (Directory.Data — приватное)
    ================= */
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Data,
      recursive: true,
    }).catch(() => {});

    const fileName = `photo_${leakId}_${version}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    if (!(rawPhoto instanceof Blob)) return null;

    const base64 = await fileToBase64(rawPhoto);

    await Filesystem.writeFile({
      path: targetPath,
      data: base64,
      directory: Directory.Data,
    });

    await cleanupOldPhotoVersions(PHOTO_FOLDER, leakId, fileName);

    return `data://${targetPath}`;
  }

  /* ================= DELETE ================= */

  async function deletePhoto(path) {
    if (!path) return;

    if (path.startsWith("idb://")) {
      if (!ready) return;
      await deleteFromIndexedDB(path.replace("idb://", ""));
      return;
    }

    if (isNative && path.startsWith("data://")) {
      try {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: path.replace("data://", ""),
        });
      } catch {
        // файл уже удалён — нормально
      }
    }
  }

  /* ================= GET ================= */

  async function getPhoto(id) {
    if (!ready || !id) return null;
    return getFromIndexedDB(id);
  }

  return {
    ready,
    isNative,
    savePhoto,
    deletePhoto,
    getPhoto,
  };
}
