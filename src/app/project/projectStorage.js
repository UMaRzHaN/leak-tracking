import { STORAGE_KEYS } from "./storageKeys";

export function toFolderName(name) {
  return (
    String(name ?? "")
      .trim()
      .replace(/[<>:"/\\|?*\0]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 50) || "project"
  );
}

export function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveProjects(list) {
  localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(list));
}

export function loadActiveId() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID) ?? null;
}

export function saveActiveId(id) {
  if (id == null) {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
  } else {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, id);
  }
}
