import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { useIndexedDB } from "./useIndexedDB";
import { getProjectMobileDir } from "../constants/storage.constants";
import { useProject } from "../app/settings/ProjectContext";

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

async function fetchWebPathAsBase64(webPath) {
  const blob = await fetch(webPath).then((r) => r.blob());
  return fileToBase64(blob);
}

/**
 * 🧹 Удаляет все старые версии фото утечки, кроме текущей
 */
async function cleanupOldPhotoVersions(folder, leakId, keepFileName) {
  try {
    const { files } = await Filesystem.readdir({
      path: folder,
      directory: Directory.Documents,
    });

    const prefix = `photo_${leakId}_`;

    for (const file of files) {
      if (
        file.name.startsWith(prefix) &&
        file.name !== keepFileName
      ) {
        await Filesystem.deleteFile({
          directory: Directory.Documents,
          path: `${folder}/${file.name}`,
        });
      }
    }
  } catch (e) {
    console.warn("cleanupOldPhotoVersions error:", e);
  }
}

/* ================= HOOK ================= */

export function usePhotoStorage() {
  const {
    ready,
    savePhoto: saveToIndexedDB,
    getPhoto: getFromIndexedDB,
    deletePhoto: deleteFromIndexedDB,
    listKeys, // ⚠️ предполагается, что хук умеет это
  } = useIndexedDB();

  const { project } = useProject();
  const baseDir = getProjectMobileDir(project);

  const isNative = Capacitor.isNativePlatform();

  // Documents/LeakReports/{folder}/photos
  const PHOTO_FOLDER = `${baseDir}/photos`;

  /* ================= SAVE ================= */

  async function savePhoto(rawPhoto, leakId) {
    if (!rawPhoto || !leakId) return null;

    const version = Date.now();

    /* =================
       🌐 WEB (IndexedDB)
    ================= */
    if (!isNative) {
      if (!ready) {
        console.warn("IndexedDB not ready, skip savePhoto");
        return null;
      }

      if (!(rawPhoto instanceof Blob)) {
        console.error("WEB: rawPhoto is not File/Blob", rawPhoto);
        return null;
      }

      const base64 = await fileToBase64(rawPhoto);
      const mime = rawPhoto.type || "image/jpeg";

      const photoId = `photo_${leakId}_${version}`;
      const photoData = `data:${mime};base64,${base64}`;

      const ok = await saveToIndexedDB(photoId, photoData);
      if (!ok) return null;

      // 🧹 cleanup старых версий (WEB)
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
       📱 MOBILE (FS)
    ================= */
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    const fileName = `photo_${leakId}_${version}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    if (rawPhoto.webPath) {
      const base64 = await fetchWebPathAsBase64(rawPhoto.webPath);

      await Filesystem.writeFile({
        path: targetPath,
        data: base64,
        directory: Directory.Documents,
        encoding: Encoding.BASE64,
      });

      // 🧹 cleanup старых версий (MOBILE)
      await cleanupOldPhotoVersions(PHOTO_FOLDER, leakId, fileName);

      return `Documents/${targetPath}`;
    }

    console.error("MOBILE: unsupported rawPhoto", rawPhoto);
    return null;
  }

  /* ================= DELETE ================= */

  async function deletePhoto(path) {
    if (!path) return;

    /* 🌐 IndexedDB */
    if (path.startsWith("idb://")) {
      if (!ready) {
        console.warn("IndexedDB not ready, skip deletePhoto");
        return;
      }

      const photoId = path.replace("idb://", "");
      await deleteFromIndexedDB(photoId);
      return;
    }

    /* 📱 Mobile FS */
    if (isNative && path.startsWith("Documents/")) {
      try {
        await Filesystem.deleteFile({
          directory: Directory.Documents,
          path: path.replace(/^Documents\//, ""),
        });
      } catch (e) {
        console.warn("deletePhoto error:", e);
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
    mkdir: baseDir, // полезно для логов / отладки
    savePhoto,
    deletePhoto,
    getPhoto,
  };
}
