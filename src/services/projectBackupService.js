// Dynamic imports for heavy export libraries - loaded on-demand only
const getJSZip = () => import("jszip");

import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { VAR_DEFAULTS } from "@/data/variables";
import { getPhotoSrc } from "@/hooks/photoService";
import { LeakRepository } from "@/repositories/LeakRepository";
import {
  validateBackup,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import {
  calculations,
  isPinkBagEquipment,
} from "@/utils/calculations/calculations";
import { blobToDataUri, dataUrlToBlob } from "@/utils/photoConversion";

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

function normalizeImportedVars(vars) {
  if (!vars) return vars;

  const next = { ...vars };
  const density = Number(next.density);
  const uncertainty = Number(next.uncertainty);

  if (isPinkBagEquipment(next.equipmentType)) {
    next.equipmentType = "Розовый мешок";
  }

  if (Number.isFinite(density) && density > 0 && density < 0.01) {
    next.density = density * 1000;
  }

  if (Number.isFinite(uncertainty) && uncertainty > 0 && uncertainty <= 1) {
    next.uncertainty = uncertainty * 100;
  }

  return next;
}

function normalizeProjectMeta(meta) {
  if (!meta?.vars) return meta;
  return { ...meta, vars: normalizeImportedVars(meta.vars) };
}

function recalculateLeaks(leaks, vars) {
  if (!vars) return leaks;
  const calcVars = { ...VAR_DEFAULTS, ...vars };
  return leaks.map((leak) => calculations(leak, calcVars));
}

function parseTime(value) {
  if (value == null || value === "") return 0;
  const time = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function getLeakIdentity(leak) {
  if (leak?.id != null) return `id:${String(leak.id)}`;
  if (leak?.leak_id != null) return `tag:${String(leak.leak_id)}`;
  return null;
}

function getLeakFreshness(leak) {
  const historyTimes = Array.isArray(leak?.history)
    ? leak.history.map((entry) => parseTime(entry?.date))
    : [];
  return Math.max(
    parseTime(leak?.updatedAt),
    parseTime(leak?.createdAt),
    parseTime(leak?.resolvedAt),
    ...historyTimes,
  );
}

function isRestoredPhotoPath(path) {
  return (
    typeof path === "string" && path.trim() !== "" && !path.startsWith("zip:")
  );
}

function mergePhotoFields(existingLeak, incomingLeak) {
  const next = { ...incomingLeak };

  for (const key of PHOTO_KEYS) {
    if (
      !isRestoredPhotoPath(next[key]) &&
      isRestoredPhotoPath(existingLeak?.[key])
    ) {
      next[key] = existingLeak[key];
    }
  }

  return next;
}

export function mergeLeaksByFreshness(existing = [], incoming = []) {
  const merged = [...existing];
  const indexByIdentity = new Map();
  let added = 0;
  let updated = 0;

  merged.forEach((leak, index) => {
    const identity = getLeakIdentity(leak);
    if (identity) indexByIdentity.set(identity, index);
  });

  for (const leak of incoming) {
    const identity = getLeakIdentity(leak);
    const existingIndex = identity ? indexByIdentity.get(identity) : undefined;

    if (existingIndex == null) {
      merged.push(leak);
      if (identity) indexByIdentity.set(identity, merged.length - 1);
      added += 1;
      continue;
    }

    if (getLeakFreshness(leak) > getLeakFreshness(merged[existingIndex])) {
      merged[existingIndex] = mergePhotoFields(merged[existingIndex], leak);
      updated += 1;
    }
  }

  return { leaks: merged, added, updated, changed: added + updated };
}

function filterIncomingLeaksForMerge(existing = [], incoming = []) {
  const existingByIdentity = new Map();

  for (const leak of existing) {
    const identity = getLeakIdentity(leak);
    if (identity) existingByIdentity.set(identity, leak);
  }

  return incoming.filter((leak) => {
    const identity = getLeakIdentity(leak);
    if (!identity) return true;

    const current = existingByIdentity.get(identity);
    if (!current) return true;

    return getLeakFreshness(leak) > getLeakFreshness(current);
  });
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
    if (metaValidation.ok) return normalizeProjectMeta(metaValidation.data);
    if (parsedMeta?.project?.name && parsedMeta?.project?.type) {
      return normalizeProjectMeta(parsedMeta);
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
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  let parsed;
  try {
    parsed = JSON.parse(await jsonFile.async("string"));
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
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
        if (!path) continue;

        let blob = null;
        let fallbackPath = path;

        if (path.startsWith("zip:")) {
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
          blob = new Blob([byteArr], { type: mime });
          fallbackPath = `data:${mime};base64,${base64}`;
        } else if (path.startsWith("data:image/")) {
          blob = dataUrlToBlob(path);
        }

        if (!blob) continue;

        const storageKey = key === "photo_after" ? `${baseKey}_after` : baseKey;
        const excludePaths = Object.values(savedPaths);
        const newPath = await savePhoto(blob, storageKey, excludePaths);
        copy[key] = newPath ?? fallbackPath;
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

  throw new Error("Таймаут переключения проекта");
}

async function waitForPhotoStorage(photoReadyRef) {
  if (!photoReadyRef) return;

  for (let i = 0; i < 60; i++) {
    if (photoReadyRef.current) return;
    await delay(50);
  }

  throw new Error("Хранилище фото не готово");
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
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  const newProject = addProject(projectName, projectType);
  if (!newProject) throw new Error("Не удалось создать проект");

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
    const finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
    await saveRef.current(finalLeaks);

    return { project: newProject, leakCount: finalLeaks.length };
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
    const incomingToApply = filterIncomingLeaksForMerge(existing, leaks);
    const restoredIncoming = await restorePhotosFromZip(
      incomingToApply,
      zip,
      savePhotoRef,
    );
    const recalculatedIncoming = recalculateLeaks(restoredIncoming, meta?.vars);
    const mergeResult = mergeLeaksByFreshness(existing, recalculatedIncoming);
    finalLeaks = mergeResult.leaks;
    addedCount = mergeResult.changed;
  } else {
    if (vars) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(existingProjectId),
        JSON.stringify(vars),
      );
    }

    const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhotoRef);
    finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
    addedCount = finalLeaks.length;
  }

  await saveRef.current(finalLeaks);
  return { project: existingProject, leakCount: addedCount };
}

export async function importBackupZip(zipFile, savePhoto) {
  const { zip, leaks, meta } = await parseBackupZip(zipFile);
  const restoredLeaks = await restorePhotosFromZip(leaks, zip, savePhoto);
  return { leaks: recalculateLeaks(restoredLeaks, meta?.vars), meta };
}
