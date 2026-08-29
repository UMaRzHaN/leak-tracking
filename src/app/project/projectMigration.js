import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "@/configs/projectMeta";
import { toFolderName, saveProjects } from "./projectStorage";

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";
const LEGACY_PAYLOAD_MIGRATION_DONE_KEY = "app:legacy_payload_migrated_v2";

function markDone(key) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // The migrated project remains usable even when the marker cannot be saved.
  }
}

function markMigrationDone() {
  markDone(MIGRATION_DONE_KEY);
}

function legacyDataKeys(type) {
  return [
    STORAGE_KEYS.PROJECT_DATA(type),
    `leaks_database:${type}:v1`,
    "leaks_database_v1",
  ];
}

function firstStoredPayload(keys) {
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw !== null) return { key, raw };
  }
  return null;
}

function assertLegacyDataPayload(payload) {
  if (!payload) return;
  const parsed = JSON.parse(payload.raw);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Expected an array in legacy storage "${payload.key}"`);
  }
}

function assertLegacySettingsPayload(payload) {
  if (!payload) return;
  const parsed = JSON.parse(payload.raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(
      `Expected an object in legacy storage "${payload.key}"`,
    );
  }
}

function readLegacyPayloads(type) {
  const data = firstStoredPayload(legacyDataKeys(type));
  const settings = firstStoredPayload([
    STORAGE_KEYS._LEGACY_PROJECT_SETTINGS(type),
  ]);
  assertLegacyDataPayload(data);
  assertLegacySettingsPayload(settings);
  return { data, settings };
}

function restoreStorageValue(key, previousValue) {
  try {
    if (previousValue === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, previousValue);
    }
  } catch {
    // Legacy source keys remain intact even if best-effort rollback is blocked.
  }
}

function persistProjectAndPayloads(projects, project, payloads) {
  const writes = [];
  const dataTarget = STORAGE_KEYS.PROJECT_DATA(project.id);
  const settingsTarget = STORAGE_KEYS.PROJECT_VARS(project.id);

  // Never overwrite data that may have been written after an earlier migration.
  if (payloads.data && localStorage.getItem(dataTarget) === null) {
    writes.push([dataTarget, payloads.data.raw]);
  }
  if (payloads.settings && localStorage.getItem(settingsTarget) === null) {
    writes.push([settingsTarget, payloads.settings.raw]);
  }

  const snapshots = writes.map(([key]) => [key, localStorage.getItem(key)]);
  try {
    for (const [key, value] of writes) {
      localStorage.setItem(key, value);
    }
    // Publish the project only after every payload copy has succeeded.
    saveProjects(projects);
    return true;
  } catch {
    for (const [key, previousValue] of snapshots.reverse()) {
      restoreStorageValue(key, previousValue);
    }
    return false;
  }
}

function isPreviouslyMigratedProject(project) {
  return (
    project &&
    typeof project.id === "string" &&
    /^\d+$/.test(project.id) &&
    !project.syncId &&
    PROJECT_META[project.type]
  );
}

function repairPreviouslyMigratedProject(existingList) {
  if (!Array.isArray(existingList) || existingList.length === 0) return null;
  if (!isPreviouslyMigratedProject(existingList[0])) return null;
  if (localStorage.getItem(LEGACY_PAYLOAD_MIGRATION_DONE_KEY)) {
    return existingList;
  }

  const project = existingList[0];
  try {
    const payloads = readLegacyPayloads(project.type);
    const repairedProject =
      project.legacyStorageType === project.type
        ? project
        : { ...project, legacyStorageType: project.type };
    const repairedList =
      repairedProject === project
        ? existingList
        : [repairedProject, ...existingList.slice(1)];

    if (!persistProjectAndPayloads(repairedList, repairedProject, payloads)) {
      return existingList;
    }
    markDone(LEGACY_PAYLOAD_MIGRATION_DONE_KEY);
    return repairedList;
  } catch {
    // Keep every legacy payload intact so a later launch can retry or recover it.
    return existingList;
  }
}

/**
 * Migrates the old single-project format and repairs projects created by the
 * earlier metadata-only migration. Source data/settings are retained as recovery
 * copies; only the obsolete config is removed after every target write succeeds.
 */
export function migrateFromLegacy(existingList = []) {
  if (Array.isArray(existingList) && existingList.length > 0) {
    return repairPreviouslyMigratedProject(existingList) ?? existingList;
  }
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    const legacyActiveType = localStorage.getItem(
      STORAGE_KEYS._LEGACY_ACTIVE_PROJECT,
    );
    const old = raw
      ? JSON.parse(raw)
      : PROJECT_META[legacyActiveType]
        ? { type: legacyActiveType }
        : null;
    if (!old?.type || !PROJECT_META[old.type]) {
      markMigrationDone();
      return [];
    }

    const now = Date.now();
    const configuredAt =
      typeof old.configuredAt === "number" &&
      Number.isFinite(old.configuredAt) &&
      old.configuredAt >= 0
        ? old.configuredAt
        : now;
    const name = String(old.name ?? "").trim() || PROJECT_META[old.type].title;
    const migrated = {
      id: String(configuredAt),
      name,
      type: old.type,
      // Single-project native releases stored data below the project type,
      // not the user-visible name. Reusing this folder makes the latest legacy
      // path readable without moving or deleting its only copy.
      folderName: toFolderName(PROJECT_META[old.type].folder || old.type),
      createdAt: configuredAt,
      legacyStorageType: old.type,
    };

    const payloads = readLegacyPayloads(old.type);
    if (!persistProjectAndPayloads([migrated], migrated, payloads)) return [];

    // Remove only the obsolete config after both the project and its payloads
    // are durable. Data/settings source keys are intentionally retained as a
    // recovery copy.
    if (raw) {
      try {
        localStorage.removeItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
      } catch {
        // The saved project list prevents a duplicate migration on the next load.
      }
    }
    markMigrationDone();
    markDone(LEGACY_PAYLOAD_MIGRATION_DONE_KEY);
    return [migrated];
  } catch {
    // Keep the legacy payload intact so a later launch can retry migration.
    return [];
  }
}
