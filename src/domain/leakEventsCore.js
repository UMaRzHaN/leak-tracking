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
export function isoFromTime(time) {
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
export function toEventDate(value) {
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
