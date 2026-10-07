import {
  REPAIR_STAGE,
  getRepairBrigade,
  getRepairStage,
} from "@/domain/repairStages";
import { LEAK_EVENT_TYPES, getLeakEvents } from "@/domain/leakEvents";
import { isInRound } from "@/utils/projectRound";

/**
 * Отбор обхода ремонтов — как у обхода мониторинга: «К проверке», «Проверено»
 * в текущем обходе и все ремонты проекта.
 */
export const REPAIR_ROUND_FILTER = Object.freeze({
  DUE: "due",
  CHECKED: "checked",
  ALL: "all",
});

// Сначала идущие ремонты, за ними ждущие МТР, устранённые в конце.
const STAGE_RANK = {
  [REPAIR_STAGE.IN_REPAIR]: 0,
  [REPAIR_STAGE.WAITING_MTR]: 1,
  [REPAIR_STAGE.RESOLVED]: 2,
};

const ACTIVITY_TYPES = new Set([
  LEAK_EVENT_TYPES.REPAIR_STAGE,
  LEAK_EVENT_TYPES.REPAIR_DONE,
]);

/**
 * Последнее, что сделали с ремонтом: отметка стадии (в том числе повторная
 * проверка закрытого) или устранение.
 */
export function lastRepairActivity(leak) {
  const dates = getLeakEvents(leak)
    .filter((event) => ACTIVITY_TYPES.has(event?.type))
    .map((event) => Date.parse(String(event.date ?? "")))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

/** Ремонт проверен в обходе: его отметили или закрыли после начала обхода. */
export function isRepairChecked(leak, round) {
  return isInRound(lastRepairActivity(leak), round);
}

/**
 * Место ремонта в обходе. Устранённый до начала обхода в нём не участвует:
 * проверять у него нечего, он виден только во «Всех ремонтах».
 *
 * @returns {"due"|"checked"|"outside"}
 */
export function repairRoundState(leak, round) {
  if (isRepairChecked(leak, round)) return "checked";
  return getRepairStage(leak) === REPAIR_STAGE.RESOLVED ? "outside" : "due";
}

const STATE_RANK = { due: 0, checked: 1, outside: 2 };

export function matchesRepairSearch(leak, query) {
  if (!query) return true;
  return [
    leak.leak_id,
    leak.location,
    leak.object,
    leak.component,
    leak.repair_recommendation,
    leak.materials_equipment,
    getRepairBrigade(leak),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

/** Счётчики вкладок и сводка шапки обхода. */
export function summarizeRepairRound(repairs, round) {
  const summary = {
    due: 0,
    checked: 0,
    all: repairs.length,
    resolved: 0,
    inRepair: 0,
    waiting: 0,
  };
  for (const leak of repairs) {
    const state = repairRoundState(leak, round);
    if (state === "outside") continue;
    summary[state] += 1;
    const stage = getRepairStage(leak);
    if (stage === REPAIR_STAGE.RESOLVED) summary.resolved += 1;
    else if (stage === REPAIR_STAGE.WAITING_MTR) summary.waiting += 1;
    else summary.inRepair += 1;
  }
  return summary;
}

export function getRepairRoundItems(repairs, { filter, search, round }) {
  const query = String(search ?? "")
    .trim()
    .toLocaleLowerCase();
  return repairs
    .map((leak) => ({ leak, state: repairRoundState(leak, round) }))
    .filter(
      ({ leak, state }) =>
        (filter === REPAIR_ROUND_FILTER.ALL || state === filter) &&
        matchesRepairSearch(leak, query),
    )
    .sort(
      (left, right) =>
        STATE_RANK[left.state] - STATE_RANK[right.state] ||
        STAGE_RANK[getRepairStage(left.leak)] -
          STAGE_RANK[getRepairStage(right.leak)],
    )
    .map(({ leak }) => leak);
}
