import JSZip from "jszip";
import { getPhotoSrc } from "../photoService";
import { validateBackup, validateProjectBackupMeta } from "./backupSchema";
import { STORAGE_KEYS } from "../../app/settings/storageKeys";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

function buildProjectMeta({ project, vars } = {}) {
  if (!project) return null;
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      type: project.type,
      folderName: project.folderName,
    },
    vars: vars ?? undefined,
  };
}

export async function buildProjectBackupZip({ leaks, idbGet, project, vars }) {
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
  const meta = buildProjectMeta({ project, vars });
  if (meta) zip.file("project.json", JSON.stringify(meta, null, 2));

  return zip.generateAsync({ type: "blob" });
}

export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const blob = await buildBackupZip(leaks, idbGet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function peekBackupZip(zipFile) {
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

  let meta = null;
  const metaFile = zip.file("project.json");
  if (metaFile) {
    try {
      const parsedMeta = JSON.parse(await metaFile.async("string"));
      const metaValidation = validateProjectBackupMeta(parsedMeta);
      if (metaValidation.ok) {
        meta = metaValidation.data;
      } else if (parsedMeta?.project?.name && parsedMeta?.project?.type) {
        // Accept partial meta if at least name and type are present
        meta = parsedMeta;
      }
    } catch {
      // ignore
    }
  }

  return { leaks: validation.data, meta };
}

/**
 * Full project import orchestration — single entry point for both
 * first-run setup (ProjectSetupScreen) and in-app import (Settings).
 *
 * ctx shape:
 *   addProject(name, type)  — creates project + activates it, returns project | null
 *   savePhotoRef            — React ref; .current = savePhoto(blob, leakId) for the active project
 *   saveRef                 — React ref; .current = save(leaks) for the active project
 *   activeProjectIdRef      — React ref; .current = activeProject.id
 *   photoReadyRef?          — React ref; .current = boolean (IndexedDB ready)
 *   metaFallback?           — { name?, type? } used when ZIP has no project.json
 *
 * Returns { project, leakCount }.
 */
export async function importProjectZip(zipFile, ctx) {
  const {
    addProject,
    savePhotoRef,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    metaFallback,
  } = ctx;

  const zip = await JSZip.loadAsync(zipFile);

  // ── backup.json ────────────────────────────────────────────────────────────
  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  let parsed;
  try {
    parsed = JSON.parse(await jsonFile.async("string"));
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
  }

  const validation = validateBackup(parsed);
  if (!validation.ok) throw new Error(validation.error);
  const leaks = validation.data;

  // ── project.json ───────────────────────────────────────────────────────────
  let meta = null;
  const metaFile = zip.file("project.json");
  if (metaFile) {
    try {
      const parsedMeta = JSON.parse(await metaFile.async("string"));
      const metaValidation = validateProjectBackupMeta(parsedMeta);
      if (metaValidation.ok) {
        meta = metaValidation.data;
      } else if (parsedMeta?.project?.name && parsedMeta?.project?.type) {
        meta = parsedMeta;
      }
    } catch {
      // ignore — metaFallback may cover it
    }
  }

  const projectName = meta?.project?.name || metaFallback?.name;
  const projectType = meta?.project?.type || metaFallback?.type;
  if (!projectName || !projectType) {
    throw new Error(
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  // ── Create project (also makes it active synchronously in localStorage) ────
  const newProject = addProject(projectName, projectType);
  if (!newProject) throw new Error("Не удалось создать проект");

  // ── Wait for React state to propagate into refs ────────────────────────────
  // useEffect hooks run after render; we need saveRef / savePhotoRef to reflect
  // the new project before we touch storage.
  for (let i = 0; i < 60; i++) {
    if (activeProjectIdRef.current === newProject.id) break;
    await delay(50);
  }
  if (activeProjectIdRef.current !== newProject.id) {
    throw new Error("Таймаут переключения проекта");
  }

  // ── Wait for photo storage (IndexedDB) ────────────────────────────────────
  if (photoReadyRef) {
    for (let i = 0; i < 60; i++) {
      if (photoReadyRef.current) break;
      await delay(50);
    }
    if (!photoReadyRef.current) throw new Error("Хранилище фото не готово");
  }

  // ── Restore calculation vars ───────────────────────────────────────────────
  if (meta?.vars) {
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_VARS(newProject.id),
      JSON.stringify(meta.vars),
    );
  }

  // ── Import photos and remap zip: paths ────────────────────────────────────
  const restoredLeaks = await Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      for (const key of PHOTO_KEYS) {
        const path = leak[key];
        if (!path?.startsWith("zip:")) continue;

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

        const leakKey = leak.leak_id ?? leak.id;
        const newPath = await savePhotoRef.current(blob, leakKey);
        copy[key] = newPath ?? `data:${mime};base64,${base64}`;
      }
      return copy;
    }),
  );

  // ── Save leaks into the new project ───────────────────────────────────────
  await saveRef.current(restoredLeaks);

  return { project: newProject, leakCount: restoredLeaks.length };
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

  // Optional project meta (project.json)
  let meta = null;
  const metaFile = zip.file("project.json");
  if (metaFile) {
    try {
      const metaText = await metaFile.async("string");
      const parsedMeta = JSON.parse(metaText);
      const metaValidation = validateProjectBackupMeta(parsedMeta);
      if (metaValidation.ok) meta = metaValidation.data;
    } catch {
      // ignore invalid meta, keep importing leaks
    }
  }

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
        const leakKey = leak.leak_id ?? leak.id;
        const newPath = await savePhoto(blob, leakKey);
        copy[key] = newPath ?? dataUri;
      }
      return copy;
    }),
  );

  return { leaks: restoredLeaks, meta };
}
