import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { normalizeProjectSettings } from "@/app/project/projectSettings";
import { VAR_DEFAULTS } from "@/data/variables";
import { isPinkBagEquipment } from "@/utils/calculations/calculations";
import { calculateLeakWithSnapshot } from "@/utils/calculationParams";
import { normalizeProjectVarsUnits } from "@/utils/projectVars";

/** @param {Record<string, any>} [options] */
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

/**
 * Какой обход считать текущим после обмена архивами.
 *
 * Обходы упорядочены своим номером — для того он и есть. Раньше здесь
 * сравнивали только время последнего изменения, и это давало две беды сразу.
 *
 * Телефон откатывался назад. Обходчик начал третий обход в десять; напарник в
 * одиннадцать закрыл второй. По времени второй «свежее» — и после обмена
 * текущим на обоих телефонах становился второй, уже завершённый. Точки,
 * пройденные в третьем обходе, снова показывались непройденными, а пройденные
 * во втором — сделанными.
 *
 * И на равенстве стороны расходились. Строгое «больше» означает, что при
 * одинаковых отметках каждый остаётся при своём, а решение принимают обе
 * стороны независимо: два телефона так и жили бы с разными текущими обходами.
 * Поэтому ничья разрешается по идентификатору — не потому, что он что-то
 * значит, а потому, что он одинаково виден обоим.
 *
 * @param {Record<string, any>|null} current
 * @param {Record<string, any>|null} incoming
 * @returns {Record<string, any>|null}
 */
export function resolveMonitoringRound(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;

  const byNumber = roundNumber(incoming) - roundNumber(current);
  if (byNumber !== 0) return byNumber > 0 ? incoming : current;

  // Номер тот же — значит это один и тот же обход, и берётся та его запись,
  // которая знает о нём больше: завершённый свежее начатого.
  const byTime =
    monitoringRoundFreshness(incoming) - monitoringRoundFreshness(current);
  if (byTime !== 0) return byTime > 0 ? incoming : current;

  return String(incoming.id) > String(current.id) ? incoming : current;
}

function roundNumber(round) {
  const number = Number(round?.number);
  return Number.isFinite(number) && number > 0 ? number : 0;
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
