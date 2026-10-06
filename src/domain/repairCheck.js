import { STATUS } from "@/utils/status";
import {
  resolveLeakRecord,
  returnLeakToWaiting,
  startLeakRepair,
} from "./leakLifecycle";
import {
  REPAIR_STAGE,
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
 *   photo_after?: string, materials_equipment?: string }} draft
 * @param {{ user?: string, now?: number }} [options]
 */
export function applyRepairCheck(leak, draft, { user, now } = {}) {
  const start = Number.isFinite(now) ? now : Date.now();
  let tick = 0;
  const at = () => ({ user, now: start + tick++ });
  const brigade = draft.brigade?.trim() || undefined;
  const note = draft.note?.trim() || undefined;
  const status = leak?.status ?? STATUS.OPEN;
  const outcome = repairCheckOutcome(draft);

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
      { stage: REPAIR_STAGE.IN_REPAIR, brigade, note },
      at(),
    );
  }

  const record =
    status === STATUS.IN_PROGRESS ? returnLeakToWaiting(leak, {}, at()) : leak;
  return markRepairStage(
    record,
    { stage: REPAIR_STAGE.WAITING_MTR, brigade, note },
    at(),
  );
}
