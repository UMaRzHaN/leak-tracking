import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { normalizeProjectSettings } from "@/app/project/projectSettings";
import { VAR_DEFAULTS } from "@/data/variables";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { calculateLeakWithSnapshot } from "@/utils/calculationParams";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";

export function buildProjectMeta({
  project,
  vars,
  settings,
  monitoringRound,
  syncState,
} = {}) {
  if (!project) return null;

  return {
    schemaVersion: 5,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      type: project.type,
      folderName: project.folderName,
      syncId: project.syncId,
    },
    vars: vars ?? undefined,
    settings: settings ?? undefined,
    monitoringRound: monitoringRound ?? undefined,
    sync: syncState ?? undefined,
  };
}

export function normalizeImportedVars(vars) {
  if (!vars) return vars;

  const next = { ...normalizeProjectVarsUnits(vars) };

  if (isPinkBagEquipment(next.equipmentType)) {
    next.equipmentType = "Розовый мешок";
  }

  return next;
}

export function normalizeProjectMeta(meta) {
  if (!meta) return meta;
  return {
    ...meta,
    ...(meta.vars ? { vars: normalizeImportedVars(meta.vars) } : {}),
    ...(meta.settings
      ? { settings: normalizeProjectSettings(meta.settings) }
      : {}),
  };
}

export function readStoredProjectVars(projectId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECT_VARS(projectId));
    return raw ? normalizeImportedVars(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function monitoringRoundFreshness(round) {
  if (!round) return 0;
  return Math.max(parseTime(round.completedAt), parseTime(round.startedAt));
}

export function recalculateLeaks(leaks, vars) {
  if (!vars) return leaks;
  const calcVars = { ...VAR_DEFAULTS, ...vars };
  return leaks.map((leak) => calculateLeakWithSnapshot(leak, calcVars));
}

export function parseTime(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const time =
    typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(numeric))
      ? numeric
      : Date.parse(String(value));
  return Number.isFinite(time) && time > 0 ? time : 0;
}
