import { STORAGE_KEYS } from "./storageKeys";
import { PROTECTED_FIELD_KEYS } from "@/configs/shared/protectedFields";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";
import { normalizeVoiceCorrections } from "@/features/voice/utils/voiceCorrections";

export const PROJECT_SETTINGS_UPDATED_EVENT = "project-settings-updated";

const DEFAULT_PHOTO_REQUIREMENTS = Object.freeze({
  leakPhotoRequired: true,
  monitoringPhotoRequired: true,
  componentPhotoRequired: true,
});

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
}

function normalizeHiddenFields(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (key) =>
          typeof key === "string" &&
          key.length > 0 &&
          !PROTECTED_FIELD_KEYS.has(key),
      ),
    ),
  ].sort();
}

function normalizePhotoRequirements(value) {
  return {
    leakPhotoRequired:
      typeof value?.leakPhotoRequired === "boolean"
        ? value.leakPhotoRequired
        : DEFAULT_PHOTO_REQUIREMENTS.leakPhotoRequired,
    monitoringPhotoRequired:
      typeof value?.monitoringPhotoRequired === "boolean"
        ? value.monitoringPhotoRequired
        : typeof value?.photoRequired === "boolean"
          ? value.photoRequired
          : DEFAULT_PHOTO_REQUIREMENTS.monitoringPhotoRequired,
    componentPhotoRequired:
      typeof value?.componentPhotoRequired === "boolean"
        ? value.componentPhotoRequired
        : DEFAULT_PHOTO_REQUIREMENTS.componentPhotoRequired,
  };
}

export function normalizeProjectSettings(value) {
  return {
    hiddenFields: normalizeHiddenFields(value?.hiddenFields),
    excelMonitoringExportMode: normalizeExcelMonitoringExportMode(
      value?.excelMonitoringExportMode,
    ),
    photoRequirements: normalizePhotoRequirements(value?.photoRequirements),
    voiceCorrections: normalizeVoiceCorrections(value?.voiceCorrections),
    updatedAt: normalizeTimestamp(value?.updatedAt),
  };
}

export function readProjectSettings(projectId) {
  if (!projectId || typeof localStorage === "undefined") {
    return normalizeProjectSettings(null);
  }

  const photoRequirements =
    readJson(STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId)) ??
    readJson(STORAGE_KEYS.PROJECT_MONITORING_SETTINGS(projectId));

  return normalizeProjectSettings({
    hiddenFields: readJson(STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(projectId)),
    excelMonitoringExportMode: localStorage.getItem(
      STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE(projectId),
    ),
    photoRequirements,
    voiceCorrections: readJson(
      STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId),
    ),
    updatedAt: localStorage.getItem(
      STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId),
    ),
  });
}

function emitSettingsUpdated(projectId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROJECT_SETTINGS_UPDATED_EVENT, {
      detail: { projectId },
    }),
  );
}

export function writeProjectSettings(projectId, value, { emit = true } = {}) {
  if (!projectId || typeof localStorage === "undefined") return null;
  const settings = normalizeProjectSettings(value);

  const hiddenKey = STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(projectId);
  if (settings.hiddenFields.length) {
    localStorage.setItem(hiddenKey, JSON.stringify(settings.hiddenFields));
  } else {
    localStorage.removeItem(hiddenKey);
  }

  const excelKey = STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE(projectId);
  if (
    settings.excelMonitoringExportMode ===
    EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
  ) {
    localStorage.setItem(excelKey, settings.excelMonitoringExportMode);
  } else {
    localStorage.removeItem(excelKey);
  }

  const photoKey = STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId);
  const usesPhotoDefaults =
    settings.photoRequirements.leakPhotoRequired ===
      DEFAULT_PHOTO_REQUIREMENTS.leakPhotoRequired &&
    settings.photoRequirements.monitoringPhotoRequired ===
      DEFAULT_PHOTO_REQUIREMENTS.monitoringPhotoRequired &&
    settings.photoRequirements.componentPhotoRequired ===
      DEFAULT_PHOTO_REQUIREMENTS.componentPhotoRequired;
  if (usesPhotoDefaults) {
    localStorage.removeItem(photoKey);
  } else {
    localStorage.setItem(photoKey, JSON.stringify(settings.photoRequirements));
  }
  localStorage.removeItem(STORAGE_KEYS.PROJECT_MONITORING_SETTINGS(projectId));

  const voiceKey = STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId);
  if (settings.voiceCorrections.length) {
    localStorage.setItem(voiceKey, JSON.stringify(settings.voiceCorrections));
  } else {
    localStorage.removeItem(voiceKey);
  }

  const timestampKey = STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId);
  if (settings.updatedAt > 0) {
    localStorage.setItem(timestampKey, String(settings.updatedAt));
  } else {
    localStorage.removeItem(timestampKey);
  }

  if (emit) emitSettingsUpdated(projectId);
  return settings;
}

export function touchProjectSettings(projectId) {
  if (!projectId || typeof localStorage === "undefined") return 0;
  const key = STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId);
  const previous = normalizeTimestamp(localStorage.getItem(key));
  const updatedAt = Math.max(Date.now(), previous + 1);
  localStorage.setItem(key, String(updatedAt));
  return updatedAt;
}

export function clearProjectSettings(projectId, { emit = false } = {}) {
  if (!projectId || typeof localStorage === "undefined") return;
  [
    STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(projectId),
    STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE(projectId),
    STORAGE_KEYS.PROJECT_MONITORING_SETTINGS(projectId),
    STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId),
    STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId),
    STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId),
  ].forEach((key) => localStorage.removeItem(key));
  if (emit) emitSettingsUpdated(projectId);
}

function comparableSettings(value) {
  const normalized = normalizeProjectSettings(value);
  return JSON.stringify({
    hiddenFields: normalized.hiddenFields,
    excelMonitoringExportMode: normalized.excelMonitoringExportMode,
    photoRequirements: normalized.photoRequirements,
    voiceCorrections: normalized.voiceCorrections,
  });
}

export function shouldApplyIncomingProjectSettings(localValue, incomingValue) {
  const local = normalizeProjectSettings(localValue);
  const incoming = normalizeProjectSettings(incomingValue);
  if (incoming.updatedAt !== local.updatedAt) {
    return incoming.updatedAt > local.updatedAt;
  }
  return comparableSettings(incoming) > comparableSettings(local);
}
