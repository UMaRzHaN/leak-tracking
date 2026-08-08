import {
  validateBackup,
  validateBackupRecovery,
  validateProjectBackupMeta,
} from "@/repositories/backupSchema";
import {
  assertArchiveLimits,
  assertImportFileSize,
  preflightZipFile,
  readArchiveEntry,
} from "@/utils/importLimits";
import {
  MONITORING_PHOTO_KEYS,
  PHOTO_KEYS,
  RECOVERY_RECORDS_FILE,
  TYPE_SIGNATURES,
} from "./constants";
import { normalizeProjectMeta } from "./projectMeta";
import { getJSZip } from "./runtime";

function parseBackupValidation(parsed) {
  const validation = validateBackup(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return validation.data;
}

export function parseRecoveryValidation(parsed) {
  const validation = validateBackupRecovery(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return validation.data;
}

function assertArchivePhotoReferences(leaks, zip) {
  const assertPhoto = (path) => {
    if (typeof path !== "string" || !path.startsWith("zip:")) return;
    const relativePath = path.slice("zip:".length);
    const entry = zip.file(relativePath);
    if (!entry || entry.dir) {
      throw new Error(`Файл фото "${relativePath}" не найден в архиве`);
    }
  };

  for (const leak of leaks) {
    for (const key of PHOTO_KEYS) assertPhoto(leak?.[key]);
    if (Array.isArray(leak?.monitoringRecords)) {
      for (const record of leak.monitoringRecords) {
        for (const key of MONITORING_PHOTO_KEYS) assertPhoto(record?.[key]);
      }
    }
  }
}

async function parseZipMeta(zip) {
  const metaFile = zip.file("project.json");
  if (!metaFile) return null;

  try {
    const parsedMeta = JSON.parse(
      await readArchiveEntry(zip, metaFile, "string"),
    );
    const metaValidation = validateProjectBackupMeta(parsedMeta);
    if (metaValidation.ok) return normalizeProjectMeta(metaValidation.data);
    const legacyProject = parsedMeta?.project;
    if (
      typeof legacyProject?.name === "string" &&
      legacyProject.name.trim() &&
      Object.hasOwn(TYPE_SIGNATURES, legacyProject.type)
    ) {
      // Old project.json variants are still useful for identifying the
      // project, but none of their unvalidated optional metadata is trusted.
      return {
        project: {
          name: legacyProject.name.trim(),
          type: legacyProject.type,
        },
      };
    }
  } catch {
    // ignore invalid project meta
  }

  return null;
}

export async function parseBackupZip(zipFile) {
  assertImportFileSize(zipFile);
  await preflightZipFile(zipFile);
  const JSZip = (await getJSZip()).default;
  const zip = await JSZip.loadAsync(zipFile);
  // Header preflight only: readArchiveEntry enforces the real byte limits
  // during the reads this parser performs anyway.
  assertArchiveLimits(zip);

  const jsonFile = zip.file("backup.json");
  if (!jsonFile) throw new Error("Файл backup.json не найден в архиве");

  let parsed;
  try {
    parsed = JSON.parse(await readArchiveEntry(zip, jsonFile, "string"));
  } catch {
    throw new Error("backup.json содержит невалидный JSON");
  }

  const leaks = parseBackupValidation(parsed);
  assertArchivePhotoReferences(leaks, zip);
  const recoveryFile = zip.file(RECOVERY_RECORDS_FILE);
  let recoveryRecords = [];
  if (recoveryFile) {
    let parsedRecovery;
    try {
      parsedRecovery = JSON.parse(
        await readArchiveEntry(zip, recoveryFile, "string"),
      );
    } catch {
      throw new Error(`${RECOVERY_RECORDS_FILE} содержит невалидный JSON`);
    }
    recoveryRecords = parseRecoveryValidation(parsedRecovery);
    assertArchivePhotoReferences(recoveryRecords, zip);
  }
  return {
    zip,
    leaks,
    recoveryRecords,
    meta: await parseZipMeta(zip),
  };
}

export function detectProjectTypeFromLeaks(leaks) {
  if (!leaks?.length) return null;

  // Scan the complete import, but count only meaningful values. A key with an
  // empty placeholder must not influence detection. Scoring avoids the old
  // "first matching type wins" behaviour and deliberately returns null when
  // two project types have the same evidence so the UI can ask the user.
  const scores = Object.fromEntries(
    Object.keys(TYPE_SIGNATURES).map((type) => [type, 0]),
  );

  for (const leak of leaks) {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) continue;
    for (const [type, fields] of Object.entries(TYPE_SIGNATURES)) {
      for (const fieldName of fields) {
        const value = leak[fieldName];
        const meaningful =
          value != null &&
          (typeof value !== "string" || value.trim().length > 0);
        if (meaningful) scores[type] += 1;
      }
    }
  }

  const ranked = Object.entries(scores).sort(
    (left, right) => right[1] - left[1],
  );
  const [winner, runnerUp] = ranked;
  if (!winner || winner[1] <= 0) return null;
  if (runnerUp && runnerUp[1] === winner[1]) return null;
  return winner[0];
}

export async function peekBackupZip(zipFile) {
  const { leaks, meta, recoveryRecords } = await parseBackupZip(zipFile);

  return {
    leaks,
    meta,
    recoveryRecordCount: recoveryRecords.length,
    detectedType: detectProjectTypeFromLeaks(leaks),
  };
}
