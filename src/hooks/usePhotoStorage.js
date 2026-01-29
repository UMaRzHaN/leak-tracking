import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { useIndexedDB } from "./useIndexedDB";
import { useProjectConfig } from "../app/settings/useProjectConfig";

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

/* ================= HOOK ================= */

export function usePhotoStorage() {
  const {
    ready,
    savePhoto: saveToIndexedDB,
    getPhoto: getFromIndexedDB,
    deletePhoto: deleteFromIndexedDB,
  } = useIndexedDB();

  const projectConfig = useProjectConfig();
  const projectFolder = projectConfig?.folder ?? "Common";

  const isNative = Capacitor.isNativePlatform();

  // 📁 итоговая папка проекта
  const PHOTO_FOLDER = `LeakReports/${projectFolder}/photos`;

  /* ================= SAVE ================= */

  async function savePhoto(rawPhoto, leakId) {
    if (!rawPhoto || !leakId) return null;

    /* 🌐 WEB */
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
      const photoId = `photo_${leakId}_${Date.now()}`;
      const photoData = `data:${mime};base64,${base64}`;

      const ok = await saveToIndexedDB(photoId, photoData);
      if (!ok) return null;

      return `idb://${photoId}`;
    }

    /* 📱 MOBILE */
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    const fileName = `photo_${leakId}_${Date.now()}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    if (rawPhoto.webPath) {
      const base64 = await fetchWebPathAsBase64(rawPhoto.webPath);

      await Filesystem.writeFile({
        path: targetPath,
        data: base64,
        directory: Directory.Documents,
        encoding: Encoding.BASE64,
      });

      return `Documents/${targetPath}`;
    }

    console.error("MOBILE: unsupported rawPhoto", rawPhoto);
    return null;
  }

  /* ================= DELETE ================= */

  async function deletePhoto(path) {
    if (!path) return;

    // IndexedDB
    if (path.startsWith("idb://")) {
      if (!ready) {
        console.warn("IndexedDB not ready, skip deletePhoto");
        return;
      }

      const photoId = path.replace("idb://", "");
      await deleteFromIndexedDB(photoId);
      return;
    }

    // Mobile FS
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
    projectFolder, // 👈 иногда полезно в UI / логах
    savePhoto,
    deletePhoto,
    getPhoto,
  };
}
