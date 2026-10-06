import {
  LEAK_EVENT_TYPES,
  appendLeakEvent,
  getEventsOfType,
  getLeakEvents,
  sortLeakEvents,
} from "./leakEventsCore";
import { getRepairIterations } from "./leakEventsRepairs";
import { STATUS } from "@/utils/status";

/**
 * Стадии ремонта для модуля «Ремонт» (7a–7c).
 *
 * Статус записи по-прежнему один из трёх; стадия его уточняет. Открытая
 * утечка — это «ожидает МТР»: ремонт по ней ещё не начат. «В ремонте» —
 * идёт ли работа, закончила ли бригада и ждёт ли приёмки. «Принят» —
 * это устранённая утечка, у которой был ремонт: приёмка закрывает его тем же
 * переходом в «устранена», что и раньше, поэтому отдельного события для неё
 * нет.
 */
export const REPAIR_STAGE = Object.freeze({
  WAITING_MTR: "waiting_mtr",
  IN_REPAIR: "in_repair",
  READY: "ready",
  ACCEPTED: "accepted",
});

const ACTIVE_STAGES = new Set([
  REPAIR_STAGE.WAITING_MTR,
  REPAIR_STAGE.IN_REPAIR,
  REPAIR_STAGE.READY,
]);

export function isActiveRepairStage(value) {
  return ACTIVE_STAGES.has(value);
}

/** Отметки стадии после последнего начала ремонта — по порядку. */
function stageEventsOfCurrentRepair(leak) {
  const events = sortLeakEvents(getLeakEvents(leak));
  let lastStart = -1;
  events.forEach((event, index) => {
    if (event?.type === LEAK_EVENT_TYPES.REPAIR_STARTED) lastStart = index;
  });
  return events
    .slice(lastStart + 1)
    .filter(
      (event) =>
        event?.type === LEAK_EVENT_TYPES.REPAIR_STAGE &&
        isActiveRepairStage(event.stage),
    );
}

/**
 * @returns {string|null} стадия или `null`, если записи в ремонтах не место
 */
export function getRepairStage(leak) {
  const status = leak?.status ?? STATUS.OPEN;
  if (status === STATUS.OPEN) return REPAIR_STAGE.WAITING_MTR;
  if (status === STATUS.IN_PROGRESS) {
    const marks = stageEventsOfCurrentRepair(leak);
    return marks[marks.length - 1]?.stage ?? REPAIR_STAGE.IN_REPAIR;
  }
  if (status === STATUS.RESOLVED && getRepairIterations(leak).length > 0) {
    return REPAIR_STAGE.ACCEPTED;
  }
  return null;
}

/** Последняя отметка текущего ремонта: кто, когда, какая бригада. */
export function getLastRepairStageMark(leak) {
  const marks = stageEventsOfCurrentRepair(leak);
  return marks[marks.length - 1] ?? null;
}

/** Бригада — из последней отметки, где её назвали. */
export function getRepairBrigade(leak) {
  const marks = getEventsOfType(leak, LEAK_EVENT_TYPES.REPAIR_STAGE);
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    if (marks[index]?.brigade) return String(marks[index].brigade);
  }
  return null;
}

/** Записи модуля ремонтов: ждущие МТР (открытые), идущие и принятые. */
export function getRepairLeaks(leaks) {
  return (Array.isArray(leaks) ? leaks : []).filter(
    (leak) => getRepairStage(leak) !== null,
  );
}

export function countRepairStages(leaks) {
  const counts = {
    all: 0,
    [REPAIR_STAGE.WAITING_MTR]: 0,
    [REPAIR_STAGE.IN_REPAIR]: 0,
    [REPAIR_STAGE.READY]: 0,
    [REPAIR_STAGE.ACCEPTED]: 0,
  };
  for (const leak of Array.isArray(leaks) ? leaks : []) {
    const stage = getRepairStage(leak);
    if (!stage) continue;
    counts.all += 1;
    counts[stage] += 1;
  }
  return counts;
}

/**
 * Отметка стадии из обхода ремонтов. Приёмку сюда не пропускаем: «принят»
 * значит «устранена», и это делает `resolveLeakRecord` вместе со снимком
 * после работ.
 *
 * @param {any} leak
 * @param {{ stage: string, brigade?: string, note?: string }} mark
 * @param {{ user?: string, now?: number }} [options]
 */
export function markRepairStage(leak, mark, { user, now } = {}) {
  const status = leak?.status ?? STATUS.OPEN;
  // Открытая утечка и есть «ожидает МТР»: ей можно оставить бригаду и
  // замечание, но не другую стадию — для неё ремонт надо начать.
  const waiting =
    status === STATUS.OPEN && mark?.stage === REPAIR_STAGE.WAITING_MTR;
  if (status !== STATUS.IN_PROGRESS && !waiting) {
    const error = new Error("Repair stage can only be marked during a repair");
    /** @type {any} */ (error).code = "REPAIR_NOT_IN_PROGRESS";
    throw error;
  }
  if (!isActiveRepairStage(mark?.stage)) {
    const error = new Error(`Unknown repair stage: ${String(mark?.stage)}`);
    /** @type {any} */ (error).code = "INVALID_REPAIR_STAGE";
    throw error;
  }
  const time = Number.isFinite(now) ? now : Date.now();
  return {
    ...appendLeakEvent(leak, {
      type: LEAK_EVENT_TYPES.REPAIR_STAGE,
      date: time,
      stage: mark.stage,
      ...(mark.brigade ? { brigade: mark.brigade.trim() } : {}),
      ...(mark.note ? { note: mark.note.trim() } : {}),
      ...(user ? { user } : {}),
    }),
    updatedAt: time,
  };
}
