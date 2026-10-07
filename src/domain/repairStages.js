import {
  LEAK_EVENT_TYPES,
  appendLeakEvent,
  getEventsOfType,
  getLeakEvents,
  sortLeakEvents,
} from "./leakEventsCore";
import { STATUS } from "@/utils/status";

/**
 * Стадии ремонта для модуля «Ремонт» (7a–7c).
 *
 * Стадия повторяет статус записи: открытая утечка — «ожидает МТР» (ремонт
 * не начат), в ремонте — «в ремонте», устранённая — «устранена». Отметки
 * обхода с бригадой и замечанием лежат в ленте событий; закрытие ремонта —
 * тот же переход в «устранена», что и раньше, без отдельного события.
 */
export const REPAIR_STAGE = Object.freeze({
  WAITING_MTR: "waiting_mtr",
  IN_REPAIR: "in_repair",
  // Отметка «готово» осталась в записях обходов прошлых версий. Читается, но
  // своей стадией больше не показывается: такой ремонт — всё ещё «в ремонте».
  READY: "ready",
  RESOLVED: "resolved",
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
  // Отметки обхода прошлых версий («ждём МТР», «готово») стадию в ремонте
  // не меняют: «ожидает МТР» — это открытая утечка.
  if (status === STATUS.IN_PROGRESS) return REPAIR_STAGE.IN_REPAIR;
  if (status === STATUS.RESOLVED) return REPAIR_STAGE.RESOLVED;
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

/** Записи модуля ремонтов: ждущие МТР (открытые), идущие и устранённые. */
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
    [REPAIR_STAGE.RESOLVED]: 0,
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
 * @param {{ stage: string, brigade?: string, note?: string, photo?: string,
 *   materials_equipment?: string }} mark
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
  return appendStageMark(leak, mark, { user, now });
}

/**
 * Повторная проверка закрытого ремонта: утечки нет, ремонт остаётся закрытым.
 * Статус не меняется — в ленту ложится отметка со стадией «устранена»: её видно
 * в журнале ремонтов, и обход ремонтов засчитывает проверку по ней.
 *
 * @param {any} leak
 * @param {{ brigade?: string, note?: string, photo?: string,
 *   materials_equipment?: string }} mark
 * @param {{ user?: string, now?: number }} [options]
 */
export function confirmRepairResolved(leak, mark, { user, now } = {}) {
  if (leak?.status !== STATUS.RESOLVED) {
    const error = new Error("Only a resolved repair can be confirmed");
    /** @type {any} */ (error).code = "REPAIR_NOT_RESOLVED";
    throw error;
  }
  return appendStageMark(
    leak,
    { ...mark, stage: REPAIR_STAGE.RESOLVED },
    { user, now },
  );
}

/**
 * @param {any} leak
 * @param {{ stage: string, brigade?: string, note?: string, photo?: string,
 *   materials_equipment?: string }} mark
 * @param {{ user?: string, now?: number }} options
 */
function appendStageMark(leak, mark, { user, now }) {
  const time = Number.isFinite(now) ? now : Date.now();
  return {
    ...appendLeakEvent(leak, {
      type: LEAK_EVENT_TYPES.REPAIR_STAGE,
      date: time,
      stage: mark.stage,
      ...(mark.brigade ? { brigade: mark.brigade.trim() } : {}),
      ...(mark.note ? { note: mark.note.trim() } : {}),
      // Снимок и МТР с проверки, после которой ремонт продолжается: их видно
      // в журнале ремонтов, а снимок держит уборка фото — он в событии.
      ...(mark.photo ? { photo: mark.photo } : {}),
      ...(mark.materials_equipment
        ? { materials_equipment: mark.materials_equipment }
        : {}),
      ...(user ? { user } : {}),
    }),
    updatedAt: time,
  };
}

/**
 * Лог ремонтов для карточки утечки: начала и завершения ремонтов, отметки
 * стадий с бригадой и замечанием и возвраты в «открыта» (ремонт встал без
 * МТР). Возврат событием не пишется — он есть только в журнале статусов, —
 * поэтому берётся оттуда. Новые сверху.
 *
 * @returns {Array<{ id: string, kind: string, date: string, user?: string,
 *   stage?: string, brigade?: string, note?: string, materials?: string,
 *   photo?: string, roundNumber?: number }>}
 */
export function getRepairLog(leak) {
  const kinds = new Set([
    LEAK_EVENT_TYPES.REPAIR_STARTED,
    LEAK_EVENT_TYPES.REPAIR_STAGE,
    LEAK_EVENT_TYPES.REPAIR_DONE,
  ]);
  const fromEvents = getLeakEvents(leak)
    .filter((event) => kinds.has(event?.type) && event?.date)
    .map((event, index) => ({
      id: String(event.id ?? `${event.type}-${index}`),
      kind: event.type,
      date: new Date(event.date).toISOString(),
      ...(event.user ? { user: String(event.user) } : {}),
      ...(event.stage ? { stage: event.stage } : {}),
      ...(event.brigade ? { brigade: String(event.brigade) } : {}),
      ...(event.note ? { note: String(event.note) } : {}),
      ...(event.materials_equipment
        ? { materials: String(event.materials_equipment) }
        : {}),
      ...(event.photo ? { photo: String(event.photo) } : {}),
      ...(Number.isFinite(event.roundNumber)
        ? { roundNumber: event.roundNumber }
        : {}),
      // Ответы проверки ремонта («физ. тег есть?»; фикция снимается ею же).
      ...(typeof event.physicalTag === "boolean"
        ? { physicalTag: event.physicalTag }
        : {}),
      ...(typeof event.fiction === "boolean" ? { fiction: event.fiction } : {}),
    }));
  // Возврат в «открыта» — только тот, что шёл из ремонта: переоткрытие
  // устранённой утечки обходом — уже не про ремонт.
  const history = Array.isArray(leak?.history) ? leak.history : [];
  const returns = [];
  let previous = /** @type {string} */ (STATUS.OPEN);
  history.forEach((entry, index) => {
    if (entry?.action !== "status_changed") return;
    if (
      entry.to === STATUS.OPEN &&
      previous === STATUS.IN_PROGRESS &&
      entry.date
    ) {
      returns.push({
        id: `returned-${index}`,
        kind: "returned",
        date: new Date(entry.date).toISOString(),
        ...(entry.user ? { user: String(entry.user) } : {}),
      });
    }
    previous = entry.to ?? previous;
  });
  // Проверка ремонта пишет возврат и следом отметку «ожидает МТР» с бригадой
  // и замечанием — это одно действие, и в логе оно одной строкой.
  const waitingMarks = fromEvents.filter(
    (item) => item.stage === REPAIR_STAGE.WAITING_MTR,
  );
  const lonelyReturns = returns.filter(
    (item) =>
      !waitingMarks.some((mark) => {
        const gap = Date.parse(mark.date) - Date.parse(item.date);
        return gap >= 0 && gap < 5000;
      }),
  );
  return [...fromEvents, ...lonelyReturns].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date),
  );
}
