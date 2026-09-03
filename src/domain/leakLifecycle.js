import {
  EVENT_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { requireHistoryUser } from "@/utils/historyUser";
import { STATUS, nextStatus } from "@/utils/status";
import {
  LEAK_EVENT_TYPES,
  createLeakEvent,
  getLeakEvents,
  sortLeakEvents,
} from "@/domain/leakEvents";

const STATUS_NOTE_FIELDS = [{ key: "materials_equipment" }, { key: "note" }];

function lifecycleTime(now) {
  const timestamp = typeof now === "number" ? now : Date.now();
  return { timestamp, iso: new Date(timestamp).toISOString() };
}

function assertStatusTransition(leak, targetStatus) {
  const currentStatus = leak?.status ?? STATUS.OPEN;
  const expectedStatus = nextStatus(currentStatus);
  if (targetStatus === expectedStatus) return;
  const error = new Error(
    `Invalid leak status transition: ${currentStatus} -> ${targetStatus}`,
  );
  error.code = "INVALID_LEAK_STATUS_TRANSITION";
  throw error;
}

/**
 * Статус, который переход оставляет в ленте событий.
 *
 * Возврата в работу здесь нет намеренно. «Утечка вернулась» видно из самой
 * ленты — за завершённым ремонтом идёт следующий начатый, — а снимка у ручного
 * возврата нет, и событие вышло бы пустой отметкой рядом с той же записью в
 * журнале изменений. Возврат по итогам обхода приходит осмотром, у которого
 * фото есть.
 */
const STATUS_EVENT_TYPES = {
  [STATUS.IN_PROGRESS]: LEAK_EVENT_TYPES.REPAIR_STARTED,
  [STATUS.RESOLVED]: LEAK_EVENT_TYPES.REPAIR_DONE,
};

const EVENT_PHOTO_SOURCES = {
  [LEAK_EVENT_TYPES.REPAIR_STARTED]: "photo_repair",
  [LEAK_EVENT_TYPES.REPAIR_DONE]: "photo_after",
};

/**
 * Дописывает событие к переходу статуса.
 *
 * Снимок берётся с уже сложенной записи, а не из черновика: три вызывающих
 * места кладут его туда по-разному — из черновика, из прежнего значения или
 * не кладут вовсе, — и читать результат надёжнее, чем повторять эту развилку
 * в каждом из них.
 */
function withStatusEvent(after, { to, user, iso }) {
  const type = STATUS_EVENT_TYPES[to];
  // Возврат в работу события не оставляет, а уже накопленную ленту уносит
  // расстановка `...after` у вызывающего.
  if (!type) return undefined;

  const photo = after[EVENT_PHOTO_SOURCES[type]];
  return sortLeakEvents([
    ...getLeakEvents(after),
    createLeakEvent({
      type,
      date: iso,
      user,
      ...(photo ? { photo } : {}),
    }),
  ]);
}

/**
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @param {object} entry
 * @param {string} entry.to
 * @param {string} entry.user
 * @param {string} entry.iso
 * @param {import("@/utils/historyChanges").LeakHistoryChange[]} [entry.changes]
 */
function withStatusHistory(before, after, { to, user, iso, changes = [] }) {
  const events = withStatusEvent(after, { to, user, iso });
  return {
    ...after,
    ...(events ? { events } : {}),
    history: [
      ...(before.history ?? []),
      {
        action: "status_changed",
        to,
        date: iso,
        user: requireHistoryUser(user),
        ...(changes.length > 0 ? { changes } : {}),
      },
    ],
  };
}

export function getOrphanedOriginalPhoto(leak) {
  if (
    leak?.status !== STATUS.RESOLVED ||
    !leak.photo ||
    !leak.photo_after ||
    leak.photo === leak.photo_after
  ) {
    return null;
  }
  return leak.photo;
}

/** @param {any} leak @param {any} status @param {{user?: any, now?: number}} [options] */
export function changeLeakStatus(leak, status, { user, now } = {}) {
  assertStatusTransition(leak, status);
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    ...(leak.status === STATUS.RESOLVED
      ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
      : {}),
    status,
    updatedAt: timestamp,
  };

  return withStatusHistory(leak, after, { to: status, user, iso });
}

/** @param {any} leak @param {any} [draft] @param {{user?: any, now?: number}} [options] */
export function resolveLeakRecord(leak, draft = {}, { user, now } = {}) {
  assertStatusTransition(leak, STATUS.RESOLVED);
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    status: STATUS.RESOLVED,
    resolvedAt: timestamp,
    photo_after: draft.photo_after ?? leak.photo_after,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: STATUS_NOTE_FIELDS,
    includeKeys: ["photo_after"],
  });

  return withStatusHistory(leak, after, {
    to: STATUS.RESOLVED,
    user,
    iso,
    changes,
  });
}

/** @param {any} leak @param {any} [draft] @param {{user?: any, now?: number}} [options] */
export function startLeakRepair(leak, draft = {}, { user, now } = {}) {
  assertStatusTransition(leak, STATUS.IN_PROGRESS);
  const { timestamp, iso } = lifecycleTime(now);
  const after = {
    ...leak,
    photo_after: null,
    status: STATUS.IN_PROGRESS,
    resolvedAt: null,
    repairAt: timestamp,
    photo_repair: draft.photo_repair ?? leak.photo_repair,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: STATUS_NOTE_FIELDS,
    includeKeys: ["photo_repair"],
  });

  return withStatusHistory(leak, after, {
    to: STATUS.IN_PROGRESS,
    user,
    iso,
    changes,
  });
}

/**
 * Оба списка обходятся, пока записи обхода не переехали в ленту событий целиком.
 * Снимок, оставшийся только в одном из них, — это снимок, который сборка мусора
 * сочла бы бесхозным и удалила; объединение здесь дешевле потерянного фото.
 */
export function collectLeakPhotoPaths(leak) {
  const paths = new Set(
    [leak?.photo, leak?.photo_after, leak?.photo_repair].filter(Boolean),
  );
  for (const record of leak?.monitoringRecords ?? []) {
    for (const field of MONITORING_PHOTO_FIELDS) {
      if (record?.[field]) paths.add(record[field]);
    }
  }
  for (const event of getLeakEvents(leak)) {
    for (const field of EVENT_PHOTO_FIELDS) {
      if (event?.[field]) paths.add(event[field]);
    }
  }
  return [...paths];
}

export function isPhotoReferenced(path, leaks) {
  if (!path) return false;
  const records = Array.isArray(leaks) ? leaks : [leaks];
  return records.some((leak) => collectLeakPhotoPaths(leak).includes(path));
}

export async function deletePhotoIfUnreferenced(path, leaks, deletePhoto) {
  if (!path || isPhotoReferenced(path, leaks)) return false;
  await deletePhoto(path);
  return true;
}
export async function deleteLeakPhotosIfUnreferenced(leak, leaks, deletePhoto) {
  const deleted = [];
  for (const path of collectLeakPhotoPaths(leak)) {
    if (await deletePhotoIfUnreferenced(path, leaks, deletePhoto)) {
      deleted.push(path);
    }
  }
  return deleted;
}
