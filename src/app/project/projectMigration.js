import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { toFolderName, saveProjects } from "./projectStorage";

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";

function markMigrationDone() {
  try {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
  } catch {
    // The migrated project remains usable even when the marker cannot be saved.
  }
}

/**
 * One-time migration from the old single-project format to the multi-project list.
 * After a successful migration the legacy key is removed and a flag is set so this
 * never runs again, even when the list is later emptied.
 */
export function migrateFromLegacy(existingList = []) {
  if (Array.isArray(existingList) && existingList.length > 0) {
    return existingList;
  }
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    if (!raw) {
      markMigrationDone();
      return [];
    }

    const old = JSON.parse(raw);
    if (!old?.type || !PROJECT_META[old.type]) {
      markMigrationDone();
      return [];
    }

    const now = Date.now();
    const name = String(old.name || PROJECT_META[old.type].title);
    const migrated = {
      id: String(old.configuredAt ?? now),
      name,
      type: old.type,
      folderName: toFolderName(name),
      createdAt: old.configuredAt ?? now,
    };

    // Persist the new representation before removing the only legacy copy.
    saveProjects([migrated]);
    try {
      localStorage.removeItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    } catch {
      // The saved project list prevents a duplicate migration on the next load.
    }
    markMigrationDone();
    return [migrated];
  } catch {
    // Keep the legacy payload intact so a later launch can retry migration.
    return [];
  }
}
