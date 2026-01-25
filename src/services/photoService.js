import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const PHOTO_FOLDER = "LeakReports/photos";

/**
 * 💾 Сохраняет фото
 * @param {File|Blob|CameraPhoto} rawPhoto
 * @param {string|number} id
 * @returns {Promise<string|null>}
 */
export async function savePhotoToFS(rawPhoto, id) {
  if (!rawPhoto || !id) return null;

  /* =======================
     🌐 WEB
  ======================= */
  if (!Capacitor.isNativePlatform()) {
    if (!(rawPhoto instanceof Blob)) {
      console.error("WEB: rawPhoto is not File/Blob", rawPhoto);
      return null;
    }

    const base64 = await fileToBase64(rawPhoto);
    return `data:image/jpeg;base64,${base64}`;
  }

  /* =======================
     📱 NATIVE
  ======================= */
  if (!rawPhoto.path) return null;

  try {
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });

    const fileName = `photo_${id}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    const base64 = await fetch(rawPhoto.webPath).then((r) => r.blob());
    const base64Data = await fileToBase64(base64);

    await Filesystem.writeFile({
      path: targetPath,
      data: base64Data,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    return `Documents/${targetPath}`;
  } catch (e) {
    console.error("savePhotoToFS error:", e);
    return null;
  }
}

/* =======================
   🗑 DELETE (native only)
======================= */
export async function deletePhotoFromFS(path) {
  if (
    !path ||
    !Capacitor.isNativePlatform() ||
    !path.startsWith("Documents/")
  )
    return;

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
    return path; // data:image/...
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
