import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "@/configs/projects";
import { toFolderName, saveProjects } from "./projectStorage";

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";

/**
 * One-time migration from the old single-project format to the multi-project list.
 * After a successful migration the legacy key is removed and a flag is set so this
 * never runs again, even when the list is later emptied.
 */
export function migrateFromLegacy(existingList) {
  if (existingList.length > 0) return existingList;
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    if (!raw) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      return [];
    }

    const old = JSON.parse(raw);
    if (!old?.type || !PROJECT_META[old.type]) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      return [];
    }

    const migrated = {
      id: String(old.configuredAt ?? Date.now()),
      name: old.name || PROJECT_META[old.type].title,
      type: old.type,
      folderName: toFolderName(old.name || PROJECT_META[old.type].title),
      createdAt: old.configuredAt ?? Date.now(),
    };

    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    localStorage.removeItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    saveProjects([migrated]);
    return [migrated];
  } catch {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return [];
  }
}
