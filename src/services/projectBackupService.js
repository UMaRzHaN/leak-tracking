// Dynamic imports for heavy export libraries - loaded on-demand only
const getJSZip = () => import("jszip");

import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { getPhotoSrc } from "@/hooks/photoService";
import { LeakRepository } from "@/repositories/LeakRepository";
import {
  validateBackup,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import { blobToDataUri } from "@/utils/photoConversion";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PHOTO_KEYS = ["photo", "photo_after"];
const SUFFIX = { photo: "before", photo_after: "after" };

/** Maps unique field keys to their project type. */
const TYPE_SIGNATURES = {
  midstream: ["station", "field"],
  upstream: ["subdivision", "deposit"],
  downstream: ["district", "locality", "address"],
};

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
  return {
    mime: match[1],
    base64: match[2],
    ext: match[1].split("/")[1] || "jpg",
  };
}

async function exportLeaksWithPhotos(leaks, zip, idbGet) {
  const photosFolder = zip.folder("photos");

  return Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      const leakNumber = String(leak.leak_id ?? leak.id).replace(/[\\/]/g, "_");
      const leakFolder = photosFolder.folder(leakNumber);

      for (const key of PHOTO_KEYS) {
        const path = leak[key];
        if (!path) continue;
        const resolved = await resolveBase64(path, idbGet);
        if (!resolved) continue;

        const fileName = `${SUFFIX[key]}.${resolved.ext}`;
        leakFolder.file(fileName, resolved.base64, { base64: true });
        copy[key] = `zip:photos/${leakNumber}/${fileName}`;
      }

      return copy;
    }),
  );
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

function parseBackupValidation(parsed) {
  const validation = validateBackup(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return validation.data;
}

async function parseZipMeta(zip) {
  const metaFile = zip.file("project.json");
  if (!metaFile) return null;

  try {
    const parsedMeta = JSON.parse(await metaFile.async("string"));
    const metaValidation = validateProjectBackupMeta(parsedMeta);
    if (metaValidation.ok) return metaValidation.data;
    if (parsedMeta?.project?.name && parsedMeta?.project?.type) {
      return parsedMeta;
    }
  } catch {
    // ignore invalid project meta
  }

  return null;
}

async function parseBackupZip(zipFile) {
  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(zipFile);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile)
    throw new Error("Р¤Р°Р№Р» backup.json РЅРµ РЅР°Р№РґРµРЅ РІ Р°СЂС…РёРІРµ");

  let parsed;
  try {
    parsed = JSON.parse(await jsonFile.async("string"));
  } catch {
    throw new Error("backup.json СЃРѕРґРµСЂР¶РёС‚ РЅРµРІР°Р»РёРґРЅС‹Р№ JSON");
  }

  return {
    zip,
    leaks: parseBackupValidation(parsed),
    meta: await parseZipMeta(zip),
  };
}

async function restorePhotosFromZip(leaks, zip, savePhotoRefOrFn) {
  const savePhoto =
    typeof savePhotoRefOrFn === "function"
      ? savePhotoRefOrFn
      : savePhotoRefOrFn?.current;

  return Promise.all(
    leaks.map(async (leak) => {
      const copy = { ...leak };
      const baseKey = String(leak.leak_id ?? leak.id);
      const savedPaths = {};

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
        for (let i = 0; i < byteChars.length; i++) {
          byteArr[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArr], { type: mime });

        const storageKey = key === "photo_after" ? `${baseKey}_after` : baseKey;
        const excludePaths = Object.values(savedPaths);
        const newPath = await savePhoto(blob, storageKey, excludePaths);
        copy[key] = newPath ?? `data:${mime};base64,${base64}`;
        if (newPath) savedPaths[key] = newPath;
      }

      return copy;
    }),
  );
}

function rollbackImportedProject(project, removeProject) {
  if (!project?.id) return;

  localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(project.id));
  if (typeof removeProject === "function") {
    try {
      removeProject(project.id);
    } catch {
      // ignore rollback cleanup errors
    }
  }
}

async function waitForProjectActivation(activeProjectIdRef, projectId) {
  for (let i = 0; i < 60; i++) {
    if (activeProjectIdRef.current === projectId) return;
    await delay(50);
  }

  throw new Error("РўР°Р№РјР°СѓС‚ РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ РїСЂРѕРµРєС‚Р°");
}

async function waitForPhotoStorage(photoReadyRef) {
  if (!photoReadyRef) return;

  for (let i = 0; i < 60; i++) {
    if (photoReadyRef.current) return;
    await delay(50);
  }

  throw new Error("РҐСЂР°РЅРёР»РёС‰Рµ С„РѕС‚Рѕ РЅРµ РіРѕС‚РѕРІРѕ");
}

export async function buildBackupZip(leaks, idbGet) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet);
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function buildProjectBackupZip({ leaks, idbGet, project, vars }) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet);
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

export function detectProjectTypeFromLeaks(leaks) {
  if (!leaks?.length) return null;

  const keys = new Set(leaks.slice(0, 20).flatMap(Object.keys));
  for (const [type, fields] of Object.entries(TYPE_SIGNATURES)) {
    if (fields.some((fieldName) => keys.has(fieldName))) return type;
  }

  return null;
}

export async function peekBackupZip(zipFile) {
  const { leaks, meta } = await parseBackupZip(zipFile);

  return {
    leaks,
    meta,
    detectedType: detectProjectTypeFromLeaks(leaks),
  };
}

export async function importProjectZip(zipFile, ctx) {
  const {
    addProject,
    removeProject,
    savePhotoRef,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    metaFallback,
  } = ctx;

  const { zip, leaks, meta } = await parseBackupZip(zipFile);

  const projectName =
    ctx.overrideName?.trim() || meta?.project?.name || metaFallback?.name;
  const projectType = meta?.project?.type || metaFallback?.type;

  if (!projectName || !projectType) {
    throw new Error(
      "РђСЂС…РёРІ РЅРµ СЃРѕРґРµСЂР¶РёС‚ РјРµС‚Р°РґР°РЅРЅС‹С… РїСЂРѕРµРєС‚Р°. Р—Р°РїРѕР»РЅРёС‚Рµ РЅР°Р·РІР°РЅРёРµ Рё С‚РёРї РїСЂРѕРµРєС‚Р°.",
    );
  }

  const newProject = addProject(projectName, projectType);
  if (!newProject)
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїСЂРѕРµРєС‚");

  try {
    await waitForProjectActivation(activeProjectIdRef, newProject.id);
    await waitForPhotoStorage(photoReadyRef);

    if (meta?.vars) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(newProject.id),
        JSON.stringify(meta.vars),
      );
    }

    const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhotoRef);
    await saveRef.current(restoredLeaks);

    return { project: newProject, leakCount: restoredLeaks.length };
  } catch (error) {
    rollbackImportedProject(newProject, removeProject);
    throw error;
  }
}

export async function importIntoExistingProject(zipFile, ctx, mode) {
  const {
    overwriteProject,
    savePhotoRef,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    existingProject,
  } = ctx;

  const { id: existingProjectId, folderName: existingFolderName } =
    existingProject;
  const { zip, leaks, meta } = await parseBackupZip(zipFile);

  let vars = null;
  if (mode === "overwrite") {
    vars = meta?.vars ?? null;
  }

  overwriteProject(existingProjectId);
  await waitForProjectActivation(activeProjectIdRef, existingProjectId);
  await waitForPhotoStorage(photoReadyRef);

  let finalLeaks;
  let addedCount;

  if (mode === "merge") {
    const existing = await LeakRepository.getAll({
      projectId: existingProjectId,
      folderName: existingFolderName,
    });
    const existingIds = new Set(existing.map((leak) => String(leak.id)));
    const incomingNew = leaks.filter(
      (leak) => !existingIds.has(String(leak.id)),
    );
    const restoredNew = await restorePhotosFromZip(
      incomingNew,
      zip,
      savePhotoRef,
    );
    finalLeaks = [...existing, ...restoredNew];
    addedCount = restoredNew.length;
  } else {
    if (vars) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(existingProjectId),
        JSON.stringify(vars),
      );
    }

    const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhotoRef);
    finalLeaks = restoredLeaks;
    addedCount = restoredLeaks.length;
  }

  await saveRef.current(finalLeaks);
  return { project: existingProject, leakCount: addedCount };
}

export async function importBackupZip(zipFile, savePhoto) {
  const { zip, leaks, meta } = await parseBackupZip(zipFile);
  const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhoto);
  return { leaks: restoredLeaks, meta };
}
