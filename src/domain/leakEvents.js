import { createRecordId } from "@/utils/createRecordId";
import { matchHumanDate } from "@/utils/humanDate";

/**
 * Что происходило с утечкой — списком, а не вехами.
 *
 * До сих пор ремонт жил на самой записи одиночными полями: `repairAt`,
 * `photo_repair`, `resolvedAt`, `photo_after`. Пока утечку чинят один раз,
 * этого хватает. Но переход `resolved → open` разрешён — утечка возвращается,
 * её чинят снова, и второй ремонт затирает первый: дата, фото и сам факт
 * первой попытки исчезают. Именно эти данные и нужны, чтобы ответить, какой
 * ремонт оказался неэффективным и сколько утечек вернулось после починки.
 *
 * Второе, менее очевидное: поле и список ведут себя по-разному при обмене
 * между устройствами. Поле сводится по правилу «побеждает более свежая
 * метка» — из двух ремонтов, записанных двумя обходчиками независимо, один
 * молча пропадает. Список сводится объединением по `id`, и сохраняются оба.
 *
 * Вехи пока остаются на записи как денормализация последнего события: на них
 * завязаны колонки выгрузки, отборы и карта. Снимать их — отдельная работа,
 * после того как список приживётся.
 */

/**
 * Повторной проверки отдельным типом здесь нет: она и есть осмотр, только
 * стоящий после ремонта. Тип, отличимый лишь порядком в том же списке, ничего
 * не добавляет к тому, что уже видно из порядка.
 */
export const LEAK_EVENT_TYPES = Object.freeze({
  DETECTED: "detected",
  INSPECTION: "inspection",
  REPAIR_STARTED: "repair_started",
  REPAIR_DONE: "repair_done",
});

const EVENT_TYPE_VALUES = new Set(
  /** @type {string[]} */ (Object.values(LEAK_EVENT_TYPES)),
);

/** @param {unknown} value */
export function isLeakEventType(value) {
  return typeof value === "string" && EVENT_TYPE_VALUES.has(value);
}

/** Дата за пределами диапазона `Date` роняет `toISOString`, а не возвращает NaN. */
function isoFromTime(time) {
  if (!Number.isFinite(time) || time <= 0) return null;
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Приводит дату события к ISO.
 *
 * Читать приходится три вида: метку в миллисекундах (`repairAt`, `resolvedAt`),
 * ISO (записи мониторинга) и ДД.ММ.ГГГГ — в этом виде дату утечки набирают
 * руками и приносит импорт. Последний вид обязан идти через `matchHumanDate`:
 * `Date.parse` ждёт месяц первым и от «09.10.2026» не отказывается, а отдаёт
 * другую дату.
 *
 * Неразобранная дата возвращается как `null`, и событие с такой датой не
 * создаётся вовсе. Событие с выдуманной датой хуже отсутствующего: оно
 * встанет не на своё место в ленте и попадёт в расчёт сроков ремонта.
 */
function toEventDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isoFromTime(value.getTime());
  if (typeof value === "number") return isoFromTime(value);

  const text = String(value).trim();
  if (!text) return null;

  const human = matchHumanDate(text);
  if (human) {
    // Написанное человеком читается как UTC, а не как местное время. Часового
    // пояса в «09.10.2026» нет, а местная полночь, переведённая в ISO,
    // съезжает на сутки назад — и событие встаёт в ленту восьмым числом,
    // тогда как в карточке написано девятое.
    return isoFromTime(
      Date.UTC(
        human.year,
        human.month - 1,
        human.day,
        human.hours,
        human.minutes,
        human.seconds,
      ),
    );
  }

  return isoFromTime(Date.parse(text));
}

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

/** @param {any} leak @returns {any[]} */
export function getLeakEvents(leak) {
  return Array.isArray(leak?.events) ? leak.events : [];
}

/** Событие без разобранной даты уходит в конец: место в ленте ему неизвестно. */
function compareEvents(left, right) {
  const leftTime = Date.parse(String(left?.date ?? ""));
  const rightTime = Date.parse(String(right?.date ?? ""));
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;
  return leftTime - rightTime;
}

/** @param {any[]} events */
export function sortLeakEvents(events) {
  return [...(events ?? [])].sort(compareEvents);
}

/**
 * @param {any} event
 * @returns {import("@/types/domain").LeakEvent}
 */
export function createLeakEvent(event) {
  const type = event?.type;
  if (!isLeakEventType(type)) {
    const error = new Error(`Unknown leak event type: ${String(type)}`);
    /** @type {any} */ (error).code = "INVALID_LEAK_EVENT_TYPE";
    throw error;
  }

  const { id, date, ...rest } = event ?? {};
  return {
    ...rest,
    id: id ?? createRecordId(),
    type,
    date: toEventDate(date) ?? new Date().toISOString(),
  };
}

/** @param {any} leak @param {any} event */
export function appendLeakEvent(leak, event) {
  return {
    ...leak,
    events: sortLeakEvents([...getLeakEvents(leak), createLeakEvent(event)]),
  };
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

/** @param {any} leak @param {string} type */
export function getEventsOfType(leak, type) {
  return sortLeakEvents(getLeakEvents(leak)).filter(
    (event) => event?.type === type,
  );
}

/** @param {any} leak @param {string} [type] */
export function getLastLeakEvent(leak, type) {
  const events = sortLeakEvents(getLeakEvents(leak)).filter(
    (event) => !type || event?.type === type,
  );
  return events.length ? events[events.length - 1] : null;
}

/**
 * Попытки ремонта, парами «начали → закончили».
 *
 * Незакрытая пара — это ремонт в работе, и она остаётся в списке с пустым
 * концом: сколько ремонтов идёт прямо сейчас, спрашивают так же часто, как
 * сколько их завершено. Пара без начала тоже возможна — у записей, где
 * `repairAt` не сохранился, а `resolvedAt` есть.
 */
export function getRepairIterations(leak) {
  const iterations = [];
  let started = null;

  for (const event of sortLeakEvents(getLeakEvents(leak))) {
    if (event?.type === LEAK_EVENT_TYPES.REPAIR_STARTED) {
      if (started) iterations.push({ started, done: null });
      started = event;
    } else if (event?.type === LEAK_EVENT_TYPES.REPAIR_DONE) {
      iterations.push({ started, done: event });
      started = null;
    }
  }
  if (started) iterations.push({ started, done: null });

  return iterations;
}

/** Длительность каждой завершённой попытки ремонта в миллисекундах. */
export function getRepairDurations(leak) {
  return getRepairIterations(leak)
    .map(({ started, done }) => {
      if (!started || !done) return null;
      const from = Date.parse(String(started.date ?? ""));
      const to = Date.parse(String(done.date ?? ""));
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
      return to - from;
    })
    .filter((duration) => duration != null);
}

/**
 * Вехи ремонта, выведенные из ленты.
 *
 * Тот же приём, что у обходов: спрашивать надо в одном месте, а не читать
 * поле записи там, где оно попалось. Лента отвечает первой, поле остаётся
 * запасным — записи, заведённые до ленты, других ответов не имеют, и терять
 * их из-за переезда нельзя.
 *
 * Возвращается последнее событие своего вида: карточка показывает нынешнее
 * состояние ремонта, а не первое из бывших.
 */
function lastEventValue(leak, type, field) {
  const events = getEventsOfType(leak, type);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index]?.[field];
    if (value) return value;
  }
  return null;
}

/**
 * Последний переход в этот статус по журналу изменений.
 *
 * Третий источник после ленты и вехи, и он нужен: у записей, заведённых до
 * вех, даты ремонта нет ни в поле, ни в ленте — только отметка о смене
 * статуса. Выгрузка это уже умела своим обходом истории; знание перенесено
 * сюда, чтобы ответ был один на всех, а не у того, кто догадался посмотреть.
 */
function lastStatusChangeDate(leak, status) {
  const history = Array.isArray(leak?.history) ? leak.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.action === "status_changed" && entry?.to === status) {
      return entry?.date ?? null;
    }
  }
  return null;
}

/** Момент начала последнего ремонта: лента, веха записи, журнал. */
export function getRepairStartedAt(leak) {
  return (
    lastEventValue(leak, LEAK_EVENT_TYPES.REPAIR_STARTED, "date") ??
    leak?.repairAt ??
    lastStatusChangeDate(leak, "in_progress")
  );
}

/** Момент завершения последнего ремонта: лента, веха записи, журнал. */
export function getRepairDoneAt(leak) {
  return (
    lastEventValue(leak, LEAK_EVENT_TYPES.REPAIR_DONE, "date") ??
    leak?.resolvedAt ??
    lastStatusChangeDate(leak, "resolved")
  );
}

/** Снимок последней начатой починки. */
export function getRepairPhoto(leak) {
  return (
    lastEventValue(leak, LEAK_EVENT_TYPES.REPAIR_STARTED, "photo") ??
    leak?.photo_repair ??
    null
  );
}

/** Снимок последней завершённой починки. */
export function getRepairDonePhoto(leak) {
  return (
    lastEventValue(leak, LEAK_EVENT_TYPES.REPAIR_DONE, "photo") ??
    leak?.photo_after ??
    null
  );
}
