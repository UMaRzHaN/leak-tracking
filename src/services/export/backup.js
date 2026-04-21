import JSZip from "jszip";
import { getPhotoSrc } from "../photoService";

const PHOTO_KEYS = ["photo", "photo_after"];
const SUFFIX = { photo: "before", photo_after: "after" };

async function resolveBase64(path, idbGet) {
  if (!path) return null;

  let src = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    src = idbGet ? await idbGet(id) : null;
  } else {
    src = await getPhotoSrc(path);
  }

  if (!src || !src.startsWith("data:")) return null;
  const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2], ext: match[1].split("/")[1] || "jpg" };
}

/**
 * Export all leaks + photos as a ZIP archive.
 * Photos go into photos/ folder; backup.json has paths replaced with "zip:photos/...".
 *
 * @param {object[]} leaks       — raw leak objects
 * @param {Function} idbGet      — (id) => Promise<dataUri|null>  (web IndexedDB)
 * @param {string}   projectName — used for the archive filename
 */
export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const zip = new JSZip();
  const photosFolder = zip.folder("photos");

  const exportedLeaks = await Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      for (const key of PHOTO_KEYS) {
        const path = leak[key];
        if (!path) continue;
        const resolved = await resolveBase64(path, idbGet);
        if (!resolved) continue;

        const fileName = `${leak.id}_${SUFFIX[key]}.${resolved.ext}`;
        photosFolder.file(fileName, resolved.base64, { base64: true });
        copy[key] = `zip:photos/${fileName}`;
      }
      return copy;
    }),
  );

  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}_${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import leaks + photos from a ZIP archive.
 * Restores photos via savePhoto and returns updated leaks array.
 *
 * @param {File}     zipFile    — ZIP file selected by user
 * @param {Function} savePhoto  — (blob: Blob, leakId: string) => Promise<string|null>
 * @returns {Promise<object[]>} — leaks with restored photo paths
 */
export async function importBackupZip(zipFile, savePhoto) {
  const zip = await JSZip.loadAsync(zipFile);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  const jsonText = await jsonFile.async("string");
  const leaks = JSON.parse(jsonText);
  if (!Array.isArray(leaks)) throw new Error("Ожидается массив JSON");

  const restoredLeaks = await Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      for (const key of PHOTO_KEYS) {
        const path = leak[key];
        if (!path || !path.startsWith("zip:")) continue;

        const relativePath = path.replace("zip:", "");
        const photoFile = zip.file(relativePath);
        if (!photoFile) continue;

        const base64 = await photoFile.async("base64");
        const ext = relativePath.split(".").pop() || "jpg";
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        const dataUri = `data:${mime};base64,${base64}`;

        // Convert data URI → Blob → save via hook
        const byteChars = atob(base64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: mime });

        const newPath = await savePhoto(blob, leak.id);
        copy[key] = newPath ?? dataUri;
      }
      return copy;
    }),
  );

  return restoredLeaks;
}
