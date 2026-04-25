import JSZip from "jszip";
import { getPhotoSrc } from "../photoService";
import { validateBackup } from "./backupSchema";

const PHOTO_KEYS = ["photo", "photo_after"];
const SUFFIX = { photo: "before", photo_after: "after" };

/** Converts a Blob to a data URI string (for backward-compat Blob storage in IDB). */
function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveBase64(path, idbGet) {
  if (!path) return null;

  let src = null;
  if (path.startsWith("idb://")) {
    const id = path.replace("idb://", "");
    const raw = idbGet ? await idbGet(id) : null;
    // raw can be a Blob (new storage) or a data URI string (legacy storage)
    if (!raw) return null;
    src = raw instanceof Blob ? await blobToDataUri(raw) : raw;
  } else {
    src = await getPhotoSrc(path);
  }

  if (!src || !src.startsWith("data:")) return null;
  const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2], ext: match[1].split("/")[1] || "jpg" };
}

export async function buildBackupZip(leaks, idbGet) {
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
  return zip.generateAsync({ type: "blob" });
}

export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const blob = await buildBackupZip(leaks, idbGet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}_${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackupZip(zipFile, savePhoto) {
  const zip = await JSZip.loadAsync(zipFile);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  const jsonText = await jsonFile.async("string");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
  }

  const validation = validateBackup(parsed);
  if (!validation.ok) throw new Error(validation.error);
  const leaks = validation.data;

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

        const byteChars = atob(base64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: mime });

        const dataUri = `data:${mime};base64,${base64}`;
        const newPath = await savePhoto(blob, leak.id);
        copy[key] = newPath ?? dataUri;
      }
      return copy;
    }),
  );

  return restoredLeaks;
}
