import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

/* =======================
   💾 SAVE
======================= */
/**
 * Сохраняет фото и возвращает путь
 * WEB    → data:image/...
 * NATIVE → Documents/LeakReports/{projectId}/photo/photo_{id}.jpg
 *
 * @param {Blob|File|CameraPhoto} rawPhoto
 * @param {string|number} id
 * @param {string|number} projectId
 * @returns {Promise<string|null>}
 */
export async function savePhotoToFS(rawPhoto, id, projectId) {
  if (!rawPhoto || !id || !projectId) return null;

  /* =======================
     🌐 WEB
  ======================= */
  if (!Capacitor.isNativePlatform()) {
    if (!(rawPhoto instanceof Blob)) return null;

    const base64 = await fileToBase64(rawPhoto);
    return `data:image/jpeg;base64,${base64}`;
  }

  /* =======================
     📱 NATIVE
  ======================= */
  try {
    const folder = `LeakReports/${projectId}/photo`;
    const fileName = `photo_${id}.jpg`;
    const filePath = `${folder}/${fileName}`;

    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    const blob = rawPhoto.webPath
      ? await fetch(rawPhoto.webPath).then((r) => r.blob())
      : rawPhoto;

    const base64Data = await fileToBase64(blob);

    await Filesystem.writeFile({
      path: filePath,
      directory: Directory.Documents,
      data: base64Data,
      encoding: Encoding.BASE64,
    });

    return `Documents/${filePath}`;
  } catch (e) {
    console.error("savePhotoToFS error:", e);
    return null;
  }
}

/* =======================
   🗑 DELETE
======================= */
export async function deletePhotoFromFS(path) {
  if (!path || !Capacitor.isNativePlatform()) return;
  if (!path.startsWith("Documents/")) return;

  try {
    await Filesystem.deleteFile({
      directory: Directory.Documents,
      path: path.replace(/^Documents\//, ""),
    });
  } catch (e) {
    console.warn("deletePhotoFromFS error:", e, path);
  }
}

/* =======================
   📌 EXISTS
======================= */
export async function photoExists(path) {
  if (!path) return false;

  if (!Capacitor.isNativePlatform()) {
    return typeof path === "string" && path.startsWith("data:image/");
  }

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

/* =======================
   🖼 SRC
======================= */
export async function getPhotoSrc(path) {
  if (!path) return null;

  if (!Capacitor.isNativePlatform()) {
    return path;
  }

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

/* =======================
   🔧 HELPERS
======================= */
function fileToBase64(blob) {
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
    reader.readAsDataURL(blob);
  });
}
