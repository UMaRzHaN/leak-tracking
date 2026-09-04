import {
  LEAK_EVENT_TYPES,
  getLeakEvents,
  isoFromTime,
  sortLeakEvents,
  toEventDate,
} from "./leakEventsCore";

/**
 * Опознание события, восстановленного из старой записи.
 *
 * Случайный `id` здесь нельзя: миграция выполняется на каждом устройстве
 * своя, и два телефона, переварив одну и ту же утечку, выдали бы одному
 * событию два разных номера. При обмене оно раздвоилось бы — один ремонт стал
 * бы двумя. Номер поэтому выводится из того, что на обоих устройствах
 * одинаково: номер утечки, тип события и его дата.
 */
function migratedEventId(leakId, type, date) {
  return `${String(leakId ?? "")}:${type}:${date}`;
}

/**
 * Запись обхода — уже готовое событие осмотра.
 *
 * Поля не переименовываются: `monitoredBy`, `roundId`, `result` и остальные
 * остаются как были. Страница мониторинга и выгрузка читают их по этим именам,
 * и пока они не переехали на список, событие осмотра обязано оставаться
 * годной записью обхода — тем же объектом, к которому дописали `type`.
 */
function inspectionFromRecord(leakId, record) {
  const date = toEventDate(record?.date);
  const type = LEAK_EVENT_TYPES.INSPECTION;
  return {
    ...record,
    id: record?.id ?? migratedEventId(leakId, type, date ?? ""),
    type,
    ...(date ? { date } : {}),
  };
}

/**
 * Вехи ремонта, восстановленные с самой записи.
 *
 * Фото обнаружения здесь не восстанавливается. `photo` — это не снимок
 * находки, а текущий главный снимок карточки: при возврате утечки в работу
 * `changeLeakStatus` переносит в него `photo_after`. Приписать его событию
 * обнаружения означало бы подшить к находке снимок после ремонта, а неверная
 * привязка хуже отсутствующей. `photo_repair` и `photo_after` однозначны, пока
 * они на месте, и переносятся.
 */
function milestoneEvents(leak) {
  const events = [];
  const leakId = leak?.id;

  const detectedAt =
    isoFromTime(Number(leak?.createdAt)) ?? toEventDate(leak?.date);
  if (detectedAt) {
    events.push({
      id: migratedEventId(leakId, LEAK_EVENT_TYPES.DETECTED, detectedAt),
      type: LEAK_EVENT_TYPES.DETECTED,
      date: detectedAt,
      ...(leak?.detectedBy ? { user: leak.detectedBy } : {}),
    });
  }

  const repairAt = isoFromTime(Number(leak?.repairAt));
  if (repairAt) {
    events.push({
      id: migratedEventId(leakId, LEAK_EVENT_TYPES.REPAIR_STARTED, repairAt),
      type: LEAK_EVENT_TYPES.REPAIR_STARTED,
      date: repairAt,
      ...(leak?.photo_repair ? { photo: leak.photo_repair } : {}),
    });
  }

  const resolvedAt = isoFromTime(Number(leak?.resolvedAt));
  if (resolvedAt) {
    events.push({
      id: migratedEventId(leakId, LEAK_EVENT_TYPES.REPAIR_DONE, resolvedAt),
      type: LEAK_EVENT_TYPES.REPAIR_DONE,
      date: resolvedAt,
      ...(leak?.photo_after ? { photo: leak.photo_after } : {}),
    });
  }

  return events;
}

function dedupeById(events) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    const key = String(event?.id ?? "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(event);
  }
  return result;
}

function sameEventIds(left, right) {
  if (left.length !== right.length) return false;
  return left.every((event, index) => event?.id === right[index]?.id);
}

/**
 * Разворачивает старую запись в список событий.
 *
 * Применяется при чтении, а не при записи: иначе старая утечка оставалась бы
 * без ленты до тех пор, пока её кто-нибудь не откроет и не сохранит, — то есть
 * ровно до того момента, когда это уже поздно заметить.
 *
 * Записи обхода подмешиваются и тогда, когда список уже есть: пока в поле
 * ходят телефоны со старой сборкой, обмен приносит осмотры единственным
 * известным ей способом — в `monitoringRecords`. Повторный прогон ничего не
 * меняет, потому что номера восстановленных событий выводятся из содержимого,
 * а не выдаются заново.
 */
export function migrateLeakEvents(leak) {
  if (!leak || typeof leak !== "object") return leak;

  const existing = getLeakEvents(leak);
  const hasEvents = Array.isArray(leak.events);
  const inspections = Array.isArray(leak.monitoringRecords)
    ? leak.monitoringRecords.map((record) =>
        inspectionFromRecord(leak.id, record),
      )
    : [];

  const events = sortLeakEvents(
    dedupeById([
      ...existing,
      ...(hasEvents ? [] : milestoneEvents(leak)),
      ...inspections,
    ]),
  );

  if (hasEvents && sameEventIds(existing, events)) return leak;
  if (!hasEvents && events.length === 0) return leak;

  return { ...leak, events };
}
