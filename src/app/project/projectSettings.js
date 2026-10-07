import { STORAGE_KEYS } from "./storageKeys";
import { fromEntries } from "@/utils/fromEntries";
import { PROTECTED_FIELD_KEYS } from "@/configs/shared/protectedFields";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";
import { normalizeVoiceCorrections } from "@/features/voice/utils/voiceCorrections";

export const PROJECT_SETTINGS_UPDATED_EVENT = "project-settings-updated";

/** Режимы выгрузки листов с обходами: поле настроек — ключ хранения. */
export const EXPORT_MODE_KEYS = Object.freeze({
  excelMonitoringExportMode: STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE,
  excelRepairLogExportMode: STORAGE_KEYS.PROJECT_EXCEL_REPAIR_LOG_EXPORT_MODE,
  excelReconcileExportMode: STORAGE_KEYS.PROJECT_EXCEL_RECONCILE_EXPORT_MODE,
});

/**
 * @param {(field: string) => unknown} read
 * @returns {{ excelMonitoringExportMode: string, excelRepairLogExportMode: string, excelReconcileExportMode: string }}
 */
function mapExportModes(read) {
  return /** @type {any} */ (
    fromEntries(
      Object.keys(EXPORT_MODE_KEYS).map((field) => [
        field,
        normalizeExcelMonitoringExportMode(read(field)),
      ]),
    )
  );
}

export const DEFAULT_PHOTO_REQUIREMENTS = Object.freeze({
  leakPhotoRequired: true,
  monitoringPhotoRequired: true,
  componentPhotoRequired: true,
  // Снимок после ремонта при приёмке (7c).
  repairPhotoRequired: true,
  // Снимок осмотра компонента при сверке (6b).
  reconcilePhotoRequired: true,
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

export function normalizePhotoRequirements(value) {
  const requirements = { ...DEFAULT_PHOTO_REQUIREMENTS };
  for (const key of Object.keys(requirements)) {
    if (typeof value?.[key] === "boolean") requirements[key] = value[key];
  }
  // До раздельных требований было одно — к фото мониторинга.
  if (
    typeof value?.monitoringPhotoRequired !== "boolean" &&
    typeof value?.photoRequired === "boolean"
  ) {
    requirements.monitoringPhotoRequired = value.photoRequired;
  }
  return requirements;
}

/** Все требования к фото по умолчанию — хранить нечего. */
export function usesDefaultPhotoRequirements(requirements) {
  return Object.entries(DEFAULT_PHOTO_REQUIREMENTS).every(
    ([key, value]) => requirements[key] === value,
  );
}

/**
 * Сверка реестра и обход ремонтов — те же три разрешения, что у обходов
 * мониторинга, но у каждого свои: инвентаризацию, ремонты и обходы утечек
 * ведут разные люди. По умолчанию всё можно.
 */
export const ROUND_KINDS = /** @type {const} */ (["reconcile", "repairs"]);

const ROUND_SETTINGS_KEYS = {
  reconcile: STORAGE_KEYS.PROJECT_RECONCILE_SETTINGS,
  repairs: STORAGE_KEYS.PROJECT_REPAIR_ROUND_SETTINGS,
};

export const DEFAULT_ROUND_PERMISSIONS = Object.freeze({
  allowNew: true,
  allowFinish: true,
  allowMerge: true,
});

export function normalizeRoundPermissions(value) {
  return {
    allowNew: value?.allowNew !== false,
    allowFinish: value?.allowFinish !== false,
    allowMerge: value?.allowMerge !== false,
  };
}

export function normalizeProjectSettings(value) {
  return {
    hiddenFields: normalizeHiddenFields(value?.hiddenFields),
    ...mapExportModes((field) => value?.[field]),
    photoRequirements: normalizePhotoRequirements(value?.photoRequirements),
    voiceCorrections: normalizeVoiceCorrections(value?.voiceCorrections),
    // Новые обходы мониторинга: выключенные защищают текущий обход от
    // случайного «Новый обход». Старые настройки этого поля не знают — можно.
    allowNewRounds: value?.allowNewRounds !== false,
    // Завершение обхода — так же: выключенное прячет «Завершить обход».
    allowFinishRounds: value?.allowFinishRounds !== false,
    // И объединение с предыдущим: выключенное прячет «Объединить с № N».
    allowMergeRounds: value?.allowMergeRounds !== false,
    reconcile: normalizeRoundPermissions(value?.reconcile),
    repairs: normalizeRoundPermissions(value?.repairs),
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
    ...mapExportModes((field) =>
      localStorage.getItem(EXPORT_MODE_KEYS[field](projectId)),
    ),
    photoRequirements,
    voiceCorrections: readJson(
      STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId),
    ),
    allowNewRounds:
      localStorage.getItem(STORAGE_KEYS.PROJECT_ROUNDS_LOCKED(projectId)) !==
      "1",
    allowFinishRounds:
      localStorage.getItem(
        STORAGE_KEYS.PROJECT_ROUND_FINISH_LOCKED(projectId),
      ) !== "1",
    allowMergeRounds:
      localStorage.getItem(
        STORAGE_KEYS.PROJECT_ROUND_MERGE_LOCKED(projectId),
      ) !== "1",
    reconcile: readJson(STORAGE_KEYS.PROJECT_RECONCILE_SETTINGS(projectId)),
    repairs: readJson(STORAGE_KEYS.PROJECT_REPAIR_ROUND_SETTINGS(projectId)),
    updatedAt: localStorage.getItem(
      STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId),
    ),
  });
}

/**
 * Сообщает открытым экранам, что настройки проекта поменялись: каждый хук
 * держит свою копию прочитанного и без этого видел бы старое.
 *
 * @param {string} projectId
 */
export function emitSettingsUpdated(projectId) {
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

  for (const [field, keyOf] of Object.entries(EXPORT_MODE_KEYS)) {
    if (settings[field] === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND) {
      localStorage.setItem(keyOf(projectId), settings[field]);
    } else {
      localStorage.removeItem(keyOf(projectId));
    }
  }

  const photoKey = STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId);
  if (usesDefaultPhotoRequirements(settings.photoRequirements)) {
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

  const roundsKey = STORAGE_KEYS.PROJECT_ROUNDS_LOCKED(projectId);
  if (settings.allowNewRounds) localStorage.removeItem(roundsKey);
  else localStorage.setItem(roundsKey, "1");

  const finishKey = STORAGE_KEYS.PROJECT_ROUND_FINISH_LOCKED(projectId);
  if (settings.allowFinishRounds) localStorage.removeItem(finishKey);
  else localStorage.setItem(finishKey, "1");

  const mergeKey = STORAGE_KEYS.PROJECT_ROUND_MERGE_LOCKED(projectId);
  if (settings.allowMergeRounds) localStorage.removeItem(mergeKey);
  else localStorage.setItem(mergeKey, "1");

  for (const kind of ROUND_KINDS) {
    writeRoundPermissionsKey(projectId, kind, settings[kind]);
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
    ...Object.values(EXPORT_MODE_KEYS).map((keyOf) => keyOf(projectId)),
    STORAGE_KEYS.PROJECT_MONITORING_SETTINGS(projectId),
    STORAGE_KEYS.PROJECT_PHOTO_REQUIREMENTS(projectId),
    STORAGE_KEYS.PROJECT_VOICE_CORRECTIONS(projectId),
    STORAGE_KEYS.PROJECT_ROUNDS_LOCKED(projectId),
    STORAGE_KEYS.PROJECT_ROUND_FINISH_LOCKED(projectId),
    STORAGE_KEYS.PROJECT_ROUND_MERGE_LOCKED(projectId),
    STORAGE_KEYS.PROJECT_RECONCILE_SETTINGS(projectId),
    STORAGE_KEYS.PROJECT_REPAIR_ROUND_SETTINGS(projectId),
    STORAGE_KEYS.PROJECT_SETTINGS_UPDATED_AT(projectId),
  ].forEach((key) => localStorage.removeItem(key));
  if (emit) emitSettingsUpdated(projectId);
}

function comparableSettings(value) {
  const normalized = normalizeProjectSettings(value);
  return JSON.stringify({
    hiddenFields: normalized.hiddenFields,
    ...mapExportModes((field) => normalized[field]),
    photoRequirements: normalized.photoRequirements,
    voiceCorrections: normalized.voiceCorrections,
    allowNewRounds: normalized.allowNewRounds,
    allowFinishRounds: normalized.allowFinishRounds,
    allowMergeRounds: normalized.allowMergeRounds,
    reconcile: normalized.reconcile,
    repairs: normalized.repairs,
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

/** Можно ли заводить новые обходы мониторинга в проекте. */
export function readAllowNewRounds(projectId) {
  return readProjectSettings(projectId).allowNewRounds;
}

export function writeAllowNewRounds(projectId, allow) {
  writeRoundLock(projectId, STORAGE_KEYS.PROJECT_ROUNDS_LOCKED, allow);
}

/** Можно ли завершать обходы мониторинга в проекте. */
export function readAllowFinishRounds(projectId) {
  return readProjectSettings(projectId).allowFinishRounds;
}

export function writeAllowFinishRounds(projectId, allow) {
  writeRoundLock(projectId, STORAGE_KEYS.PROJECT_ROUND_FINISH_LOCKED, allow);
}

/** Можно ли объединять текущий обход с предыдущим. */
export function readAllowMergeRounds(projectId) {
  return readProjectSettings(projectId).allowMergeRounds;
}

export function writeAllowMergeRounds(projectId, allow) {
  writeRoundLock(projectId, STORAGE_KEYS.PROJECT_ROUND_MERGE_LOCKED, allow);
}

/**
 * Разрешения обхода `kind` в проекте: новый, завершение, объединение.
 *
 * @param {string|null} projectId
 * @param {"reconcile"|"repairs"} kind
 */
export function readRoundPermissions(projectId, kind) {
  return readProjectSettings(projectId)[kind];
}

/**
 * @param {string|null} projectId
 * @param {"reconcile"|"repairs"} kind
 * @param {Partial<typeof DEFAULT_ROUND_PERMISSIONS>} patch
 */
export function writeRoundPermissions(projectId, kind, patch) {
  if (!projectId || typeof localStorage === "undefined") return;
  writeRoundPermissionsKey(projectId, kind, {
    ...readRoundPermissions(projectId, kind),
    ...patch,
  });
  touchProjectSettings(projectId);
  emitSettingsUpdated(projectId);
}

function writeRoundPermissionsKey(projectId, kind, value) {
  const key = ROUND_SETTINGS_KEYS[kind](projectId);
  const settings = normalizeRoundPermissions(value);
  const isDefault = Object.entries(DEFAULT_ROUND_PERMISSIONS).every(
    ([name, allowed]) => settings[name] === allowed,
  );
  if (isDefault) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(settings));
}

function writeRoundLock(projectId, keyOf, allow) {
  if (!projectId || typeof localStorage === "undefined") return;
  const key = keyOf(projectId);
  if (allow) localStorage.removeItem(key);
  else localStorage.setItem(key, "1");
  touchProjectSettings(projectId);
  emitSettingsUpdated(projectId);
}
