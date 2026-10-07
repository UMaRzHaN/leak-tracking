import {
  REPAIR_STAGE,
  getRepairBrigade,
  getRepairStage,
} from "@/domain/repairStages";
import { LEAK_EVENT_TYPES, getLeakEvents } from "@/domain/leakEvents";
import { activeRoundNumber, isInRound } from "@/utils/projectRound";
import { isLeakFiction } from "@/utils/monitoring";

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
 * проверять у него нечего, он виден только во «Всех ремонтах». Кроме фикции:
 * осмотр счёл устранение мнимым, и ремонт снова к проверке.
 *
 * @returns {"due"|"checked"|"outside"}
 */
export function repairRoundState(leak, round) {
  if (isRepairChecked(leak, round)) return "checked";
  const resolved = getRepairStage(leak) === REPAIR_STAGE.RESOLVED;
  return resolved && !isLeakFiction(leak) ? "outside" : "due";
}

/**
 * Открывает ли свайп по карточке проверку ремонта. В идущем обходе — по тому
 * же правилу, что экран обхода: устранённый до его начала проверять нечего.
 * Без обхода (или после завершённого) перепроверить можно любой ремонт.
 */
export function canSwipeCheckRepair(leak, round) {
  if (activeRoundNumber(round) === undefined) return true;
  return repairRoundState(leak, round) !== "outside";
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

/**
 * @param {any[]} repairs
 * @param {{ filter: string, round: any, search?: string }} options
 */
export function getRepairRoundItems(repairs, { filter, round, search = "" }) {
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

/** События, которыми ремонт отмечается в обходе (осмотры — мониторинга). */
const REPAIR_ROUND_EVENTS = new Set([
  LEAK_EVENT_TYPES.REPAIR_STARTED,
  LEAK_EVENT_TYPES.REPAIR_STAGE,
  LEAK_EVENT_TYPES.REPAIR_DONE,
]);

/**
 * «Новый обход» начали по ошибке: проверки ремонта, записанные в нём, уходят
 * в предыдущий — как осмотры при слиянии обходов мониторинга. Иначе книга
 * показывала бы номер обхода, которого после слияния уже нет.
 *
 * @param {any[]} leaks
 * @param {number} from номер слитого обхода
 * @param {number} to номер предыдущего
 * @returns {{ data: any[], moved: number }} `moved` — сколько утечек тронуто
 */
export function moveRepairChecksToRound(leaks, from, to) {
  let moved = 0;
  const data = (Array.isArray(leaks) ? leaks : []).map((leak) => {
    if (!Array.isArray(leak?.events)) return leak;
    let touched = false;
    const events = leak.events.map((event) => {
      if (
        !REPAIR_ROUND_EVENTS.has(event?.type) ||
        Number(event.roundNumber) !== Number(from)
      ) {
        return event;
      }
      touched = true;
      return { ...event, roundNumber: to };
    });
    if (!touched) return leak;
    moved += 1;
    return { ...leak, events };
  });
  return { data, moved };
}
