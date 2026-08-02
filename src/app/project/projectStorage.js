import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "@/configs/projects";

const RESERVED_FOLDER_CHARACTERS = '<>:"/\\|?*';
const MAX_FOLDER_NAME_LENGTH = 50;
const MAX_LEGACY_FOLDER_NAME_LENGTH = 100;
const INVALID_PROJECT_LIST = "Invalid stored project list";

function stripUnsafeFolderCharacters(value) {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint > 31 &&
        codePoint !== 127 &&
        !RESERVED_FOLDER_CHARACTERS.includes(character)
      );
    })
    .join("");
}

function sliceFolderCharacters(value, maximum) {
  return [...value].slice(0, maximum).join("");
}

export function toFolderName(name) {
  const normalized = sliceFolderCharacters(
    stripUnsafeFolderCharacters(String(name ?? ""))
      .trim()
      .replace(/\s+/g, "_"),
    MAX_FOLDER_NAME_LENGTH,
  );

  // Native project folders are later joined to Directory.Data paths. Dot
  // segments must never be allowed to escape (or alias) LeakReports/.
  return !normalized || /^\.+$/.test(normalized) ? "project" : normalized;
}

export function toUniqueFolderName(name, existingFolders = new Set()) {
  const base = toFolderName(name);
  if (!existingFolders.has(base)) return base;

  let sequence = 2;
  let candidate;
  do {
    const suffix = `_${sequence++}`;
    const prefixLength = Math.max(1, MAX_FOLDER_NAME_LENGTH - suffix.length);
    candidate = `${sliceFolderCharacters(base, prefixLength)}${suffix}`;
  } while (existingFolders.has(candidate));

  return candidate;
}

function isSafeStoredFolderName(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_LEGACY_FOLDER_NAME_LENGTH
  ) {
    return false;
  }
  const normalized = stripUnsafeFolderCharacters(value)
    .trim()
    .replace(/\s+/g, "_");
  return value === normalized && !/^\.+$/.test(value);
}

export class ProjectStorageReadError extends Error {
  /** @param {string} message @param {any} [options] */
  constructor(message, { cause, recoveryValue } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProjectStorageReadError";
    this.code = "PROJECT_LIST_READ_FAILED";
    this.recoveryValue = recoveryValue ?? null;
  }
}

function validateStoredProjects(list) {
  const ids = new Set();
  const folders = new Set();

  for (const project of list) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (
      typeof project.id !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(project.id)
    ) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (ids.has(project.id)) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    ids.add(project.id);

    if (typeof project.name !== "string" || !project.name.trim()) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (!PROJECT_META[project.type]) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (!isSafeStoredFolderName(project.folderName)) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (folders.has(project.folderName)) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    folders.add(project.folderName);

    if (
      typeof project.createdAt !== "number" ||
      !Number.isFinite(project.createdAt) ||
      project.createdAt < 0
    ) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (
      project.syncId !== undefined &&
      (typeof project.syncId !== "string" || !project.syncId.trim())
    ) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
    if (
      project.legacyStorageType !== undefined &&
      project.legacyStorageType !== project.type
    ) {
      throw new TypeError(INVALID_PROJECT_LIST);
    }
  }

  return list;
}

export function loadProjects() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) {
      throw new TypeError("Expected the stored project list to be an array");
    }
    return validateStoredProjects(list);
  } catch (error) {
    throw new ProjectStorageReadError(
      "The stored project list is corrupted and was preserved for recovery",
      { cause: error, recoveryValue: raw },
    );
  }
}

export function preserveAndResetCorruptedProjects(recoveryValue) {
  const raw =
    recoveryValue ?? localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST) ?? null;
  if (raw != null) {
    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST_RECOVERY, raw);
  }
  localStorage.removeItem(STORAGE_KEYS.PROJECTS_LIST);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
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
