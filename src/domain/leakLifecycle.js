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
  getRepairDonePhoto,
  getRepairPhoto,
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

/**
 * Дописывает событие к переходу статуса.
 *
 * Снимок берётся с уже сложенной записи, а не из черновика: три вызывающих
 * места кладут его туда по-разному — из черновика, из прежнего значения или
 * не кладут вовсе, — и читать результат надёжнее, чем повторять эту развилку
 * в каждом из них.
 */
function withStatusEvent(after, { to, user, iso, photo }) {
  const type = STATUS_EVENT_TYPES[to];
  // Возврат в работу события не оставляет, а уже накопленную ленту уносит
  // расстановка `...after` у вызывающего.
  if (!type) return undefined;

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
 * @param {string|null} [entry.photo]
 */
function withStatusHistory(
  before,
  after,
  { to, user, iso, changes = [], photo = null },
) {
  const events = withStatusEvent(after, { to, user, iso, photo });
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
  // Снимок «после» спрашивается у ленты: у записей, заведённых после переезда,
  // поля `photo_after` нет, и сравнение с ним признало бы исходный снимок
  // нужным навсегда.
  const after = getRepairDonePhoto(leak);
  if (
    leak?.status !== STATUS.RESOLVED ||
    !leak.photo ||
    !after ||
    leak.photo === after
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
    // Снимок «после» становится главным снимком карточки: утечка снова
    // открыта, и показывать надо последнее, что о ней известно. Веха при этом
    // гасится — у записей, заведённых до переезда, она осталась бы висеть.
    ...(leak.status === STATUS.RESOLVED
      ? { photo: getRepairDonePhoto(leak) ?? leak.photo, photo_after: null }
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
  const photo = draft.photo_after ?? getRepairDonePhoto(leak);
  const after = {
    ...leak,
    // Веха гасится после того, как её значение забрано в событие: у записи,
    // заведённой до переезда, она осталась бы лежать и держать прежний снимок
    // «нужным» — его не убрала бы уборка, а лента отвечала бы уже другим.
    photo_after: null,
    status: STATUS.RESOLVED,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    // Снимок в журнал изменений больше не заносится: он лежит в событии, и
    // запись «photo_after изменился» повторяла бы его, ничего не добавляя.
    fields: STATUS_NOTE_FIELDS,
  });

  return withStatusHistory(leak, after, {
    to: STATUS.RESOLVED,
    user,
    iso,
    changes,
    photo,
  });
}

/** @param {any} leak @param {any} [draft] @param {{user?: any, now?: number}} [options] */
export function startLeakRepair(leak, draft = {}, { user, now } = {}) {
  assertStatusTransition(leak, STATUS.IN_PROGRESS);
  const { timestamp, iso } = lifecycleTime(now);
  const photo = draft.photo_repair ?? getRepairPhoto(leak);
  const after = {
    ...leak,
    // Вехи не пишутся, а у записи, заведённой до переезда, они лежат: значение
    // забрано в событие, и дальше их держать незачем.
    photo_after: null,
    photo_repair: null,
    status: STATUS.IN_PROGRESS,
    resolvedAt: null,
    materials_equipment: draft.materials_equipment ?? leak.materials_equipment,
    note: draft.note ?? leak.note,
    updatedAt: timestamp,
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: STATUS_NOTE_FIELDS,
  });

  return withStatusHistory(leak, after, {
    to: STATUS.IN_PROGRESS,
    user,
    iso,
    photo,
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
