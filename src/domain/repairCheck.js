import { STATUS } from "@/utils/status";
import { getLeakEvents } from "./leakEvents";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { requireHistoryUser } from "@/utils/historyUser";
import {
  changeLeakStatus,
  resolveLeakRecord,
  returnLeakToWaiting,
  startLeakRepair,
} from "./leakLifecycle";
import {
  REPAIR_STAGE,
  confirmRepairResolved,
  getRepairBrigade,
  markRepairStage,
} from "./repairStages";

/**
 * Проверка ремонта (7c) — свайп в модуле ремонтов и «Принять» в обходе.
 * Два ответа решают, куда уходит запись:
 *
 * - утечки нет — ремонт закрыт, «устранена» (нужен снимок после работ);
 * - утечка есть, ремонт выполнен — остаётся (или становится) «в ремонте»;
 * - утечка есть, ремонт не выполнен — «ожидает МТР», то есть «открыта».
 *
 * Закрытый ремонт проверяют повторно: «утечки нет» оставляет его закрытым с
 * отметкой проверки, «утечка есть» переоткрывает утечку и ведёт её дальше
 * так же, как открытую.
 */
export const REPAIR_CHECK_OUTCOME = Object.freeze({
  RESOLVED: "resolved",
  IN_REPAIR: "in_repair",
  WAITING_MTR: "waiting_mtr",
});

/** @param {{ leaking: boolean, done: boolean }} answers */
export function repairCheckOutcome({ leaking, done }) {
  if (!leaking) return REPAIR_CHECK_OUTCOME.RESOLVED;
  return done
    ? REPAIR_CHECK_OUTCOME.IN_REPAIR
    : REPAIR_CHECK_OUTCOME.WAITING_MTR;
}

/**
 * Несколько переходов подряд получают свои миллисекунды: лента событий
 * сортируется по дате, и отметка с тем же временем, что начало ремонта,
 * могла бы встать перед ним и потеряться.
 *
 * @param {any} leak
 * @param {{ leaking: boolean, done: boolean, brigade?: string, note?: string,
 *   photo_after?: string, materials_equipment?: string,
 *   coords?: { lat: number, lng: number, accuracy?: number }|null,
 *   physicalTag?: boolean }} draft
 * @param {{ user?: string, now?: number }} [options]
 */
export function applyRepairCheck(leak, draft, options = {}) {
  const start =
    typeof options.now === "number" && Number.isFinite(options.now)
      ? options.now
      : Date.now();
  // Координаты правятся последними: у правки своя миллисекунда после
  // переходов, и в ленте она встаёт за ними.
  const answered = applyRepairAnswers(leak, draft, {
    user: options.user,
    now: start,
  });
  const record = withPhysicalTag(leak, answered, draft.physicalTag);
  return withGpsCoords(record, draft.coords, {
    user: options.user,
    now: start + 10,
  });
}

/**
 * Ответ «физ. тег есть?» ложится в последнее событие, которое оставила эта
 * проверка (отметка стадии или завершение ремонта): отдельного события под
 * него нет, а читает его `getLastMonitoringFlag` вместе с осмотрами.
 *
 * @param {any} before
 * @param {any} after
 * @param {boolean|undefined} physicalTag
 */
function withPhysicalTag(before, after, physicalTag) {
  if (typeof physicalTag !== "boolean") return after;
  const known = new Set(getLeakEvents(before).map((event) => event?.id));
  const events = getLeakEvents(after);
  const created = events.filter((event) => !known.has(event?.id));
  const own = created[created.length - 1];
  if (!own) return after;
  return {
    ...after,
    events: events.map((event) =>
      event === own ? { ...event, physicalTag } : event,
    ),
  };
}

/**
 * Координаты по GPS из проверки — точка была записана не там. Вместе с ними
 * пишется радиус приёмника, а прежний, мерявший старую точку, уходит.
 *
 * @param {any} leak
 * @param {{ lat: number, lng: number, accuracy?: number }|null|undefined} gps
 * @param {{ user?: string, now: number }} options
 */
function withGpsCoords(leak, gps, { user, now }) {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) {
    return leak;
  }
  const after = {
    ...leak,
    lat: gps.lat,
    lng: gps.lng,
    coords_accuracy: Number.isFinite(gps.accuracy)
      ? Math.round(/** @type {number} */ (gps.accuracy))
      : undefined,
    updatedAt: now,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: [{ key: "lat" }, { key: "lng" }],
  });
  if (changes.length === 0) return leak;
  return {
    ...after,
    history: [
      ...(leak.history ?? []),
      {
        action: "edited",
        date: new Date(now).toISOString(),
        user: requireHistoryUser(user),
        changes,
      },
    ],
  };
}

/**
 * @param {any} leak
 * @param {{ leaking: boolean, done: boolean, brigade?: string, note?: string,
 *   photo_after?: string, materials_equipment?: string }} draft
 * @param {{ user?: string, now?: number }} [options]
 */
function applyRepairAnswers(leak, draft, { user, now } = {}) {
  const start =
    typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  let tick = 0;
  const at = () => ({ user, now: start + tick++ });
  const brigade = draft.brigade?.trim() || undefined;
  const note = draft.note?.trim() || undefined;
  const outcome = repairCheckOutcome(draft);
  // Снимок и МТР с проверки, после которой ремонт не закрывается заново: они
  // ложатся в отметку стадии.
  const evidence = {
    ...(draft.photo_after ? { photo: draft.photo_after } : {}),
    ...(draft.materials_equipment
      ? { materials_equipment: draft.materials_equipment }
      : {}),
  };

  if (leak?.status === STATUS.RESOLVED) {
    if (outcome === REPAIR_CHECK_OUTCOME.RESOLVED) {
      return confirmRepairResolved(leak, { brigade, note, ...evidence }, at());
    }
    leak = changeLeakStatus(leak, STATUS.OPEN, at());
  }
  const status = leak?.status ?? STATUS.OPEN;

  if (outcome === REPAIR_CHECK_OUTCOME.RESOLVED) {
    let record =
      status === STATUS.OPEN ? startLeakRepair(leak, {}, at()) : leak;
    if (brigade && brigade !== getRepairBrigade(record)) {
      record = markRepairStage(
        record,
        { stage: REPAIR_STAGE.IN_REPAIR, brigade },
        at(),
      );
    }
    return resolveLeakRecord(
      record,
      {
        photo_after: draft.photo_after,
        materials_equipment: draft.materials_equipment,
        note,
      },
      at(),
    );
  }

  if (outcome === REPAIR_CHECK_OUTCOME.IN_REPAIR) {
    const record =
      status === STATUS.OPEN ? startLeakRepair(leak, {}, at()) : leak;
    return markRepairStage(
      record,
      { stage: REPAIR_STAGE.IN_REPAIR, brigade, note, ...evidence },
      at(),
    );
  }

  const record =
    status === STATUS.IN_PROGRESS ? returnLeakToWaiting(leak, {}, at()) : leak;
  return markRepairStage(
    record,
    { stage: REPAIR_STAGE.WAITING_MTR, brigade, note, ...evidence },
    at(),
  );
}
