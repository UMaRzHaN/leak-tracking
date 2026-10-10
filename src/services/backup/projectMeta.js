import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { normalizeProjectSettings } from "@/app/project/projectSettings";
import { VAR_DEFAULTS } from "@/data/variables";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { calculateLeakWithSnapshot } from "@/utils/calculationParams";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";

export {
  monitoringRoundFreshness,
  parseTime,
  resolveMonitoringRound,
} from "./monitoringRoundResolution";

/** @param {Record<string, any>} [options] */
export function buildProjectMeta({
  project,
  vars,
  settings,
  monitoringRound,
  rounds,
  acceptances,
  survey,
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
    // Обходы ремонтов и сверки (см. projectRounds).
    rounds: rounds ?? undefined,
    acceptances: acceptances?.length ? acceptances : undefined,
    survey: survey ?? undefined,
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

export function recalculateLeaks(leaks, vars) {
  if (!vars) return leaks;
  const calcVars = { ...VAR_DEFAULTS, ...vars };
  return leaks.map((leak) => calculateLeakWithSnapshot(leak, calcVars));
}
