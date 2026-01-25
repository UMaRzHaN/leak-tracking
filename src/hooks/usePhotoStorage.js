import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const PHOTO_FOLDER = "LeakReports/photos";

export function usePhotoStorage() {
  async function savePhoto(rawPhoto, leakId) {
    if (!rawPhoto || !leakId) return null;

    /* =======================
       🌐 WEB
    ======================= */
    if (!Capacitor.isNativePlatform()) {
      // ❗ строго File / Blob
      if (!(rawPhoto instanceof Blob)) {
        console.error("WEB: rawPhoto is not File/Blob", rawPhoto);
        return null;
      }
      const base64 = await fileToBase64(rawPhoto);
      const mime = rawPhoto.type || "image/jpeg";
      return `data:${mime};base64,${base64}`;
    }

    /* =======================
       📱 MOBILE (Capacitor)
    ======================= */
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    const fileName = `photo_${leakId}.jpg`;
    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    // Camera.getPhoto → webPath
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

  async function deletePhoto(path) {
    if (!path || !Capacitor.isNativePlatform()) return;

    try {
      await Filesystem.deleteFile({
        directory: Directory.Documents,
        path: path.replace(/^Documents\//, ""),
      });
    } catch (e) {
      console.warn("deletePhoto error:", e);
    }
  }

  return { savePhoto, deletePhoto };
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

async function fetchWebPathAsBase64(webPath) {
  const blob = await fetch(webPath).then((r) => r.blob());
  return fileToBase64(blob);
}
