import {
  LEAK_EVENT_TYPES,
  getEventsOfType,
  getLeakEvents,
  sortLeakEvents,
} from "./leakEventsCore";
import { STATUS } from "@/utils/status";

// Итоги осмотра строками: `@/utils/monitoring` сам читает ленту отсюда, и
// импорт оттуда замкнул бы круг.
const INSPECTION_RESOLVED = "resolved";
const INSPECTION_STILL_LEAKING = "still_leaking";

/**
 * Что обрывает идущий ремонт, кроме его завершения.
 *
 * Завершение ремонт оставляет событием, а обрыв — нет: возврат в «ожидает
 * МТР» (`returnLeakToWaiting`) пишется только в журнал статусов, а осмотр,
 * нашедший утечку устранённой или снова текущей, кладёт в ленту осмотр, а не
 * «ремонт завершён». Без этих отметок брошенный ремонт числился бы в работе
 * вечно, а следующий за ним — «возвратом после починки», которой не было.
 *
 * `closed` — ремонт кончился тем, что утечки нет (осмотр «устранена»);
 * `abandoned` — запись вернулась в «открыта», ремонт не доведён.
 */
function repairInterruptions(leak) {
  const marks = [];
  const history = Array.isArray(leak?.history) ? leak.history : [];
  for (const entry of history) {
    if (!entry?.date) continue;
    if (entry.to === STATUS.OPEN) {
      marks.push({ date: entry.date, reason: "abandoned" });
    } else if (entry.to === STATUS.RESOLVED && entry.action === "monitoring") {
      // Ручное «устранена» уже оставило REPAIR_DONE — его не повторяем.
      marks.push({ date: entry.date, reason: "closed" });
    }
  }
  // Осмотр в ленте — на случай записей, у которых журнал не доехал (импорт).
  for (const event of getEventsOfType(leak, LEAK_EVENT_TYPES.INSPECTION)) {
    if (event?.result === INSPECTION_RESOLVED) {
      marks.push({ date: event.date, reason: "closed" });
    } else if (event?.result === INSPECTION_STILL_LEAKING) {
      marks.push({ date: event.date, reason: "abandoned" });
    }
  }
  return marks.filter((mark) =>
    Number.isFinite(Date.parse(String(mark.date ?? ""))),
  );
}

/**
 * Событие без разобранной даты — в конец, как и в `sortLeakEvents`.
 * @param {{event?: any, mark?: any}} entry
 */
function timelineTime({ event, mark }) {
  const time = Date.parse(String((event ?? mark)?.date ?? ""));
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * Попытки ремонта, парами «начали → закончили».
 *
 * Незакрытая пара — это ремонт в работе, и она остаётся в списке с пустым
 * концом: сколько ремонтов идёт прямо сейчас, спрашивают так же часто, как
 * сколько их завершено. Пара без начала тоже возможна — у записей, где
 * `repairAt` не сохранился, а `resolvedAt` есть.
 *
 * Пара, оборванная без завершения (см. `repairInterruptions`), несёт
 * `interrupted: { date, reason }` и в работе уже не числится.
 */
export function getRepairIterations(leak) {
  const iterations = [];
  let started = null;

  /** @type {{event?: any, mark?: any}[]} */
  const timeline = [
    ...sortLeakEvents(getLeakEvents(leak)).map((event) => ({ event })),
    ...repairInterruptions(leak).map((mark) => ({ mark })),
  ];
  timeline.sort((left, right) => timelineTime(left) - timelineTime(right));

  for (const { event, mark } of timeline) {
    if (mark) {
      if (started) iterations.push({ started, done: null, interrupted: mark });
      started = null;
    } else if (event?.type === LEAK_EVENT_TYPES.REPAIR_STARTED) {
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
export function lastEventValue(leak, type, field) {
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
/**
 * Когда запись в последний раз перешла в это состояние — по журналу.
 *
 * Смотрится поле `to`, а не действие: переводит запись не только смена статуса
 * вручную, но и обход, а он пишет `action: "monitoring"`. Спрашивать только
 * `status_changed` значило оставить устранённую в обходе утечку без даты
 * устранения — веха погашена, события «ремонт завершён» у неё нет, и колонка
 * книги оказывалась пустой при статусе «Устранена». Записи правки поля `to` не
 * несут вовсе, так что лишнего это не захватывает.
 */
function lastStatusChangeDate(leak, status) {
  const history = Array.isArray(leak?.history) ? leak.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.to === status && entry?.date) {
      return entry.date;
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

/**
 * Снимок последней завершённой починки.
 *
 * Третий источник — осмотр: утечку закрывает не только ремонт, но и обход,
 * нашедший, что течи больше нет. Снимок такого обхода и есть «фото после» для
 * карточки, и до переезда он попадал в веху `photo_after` именно оттуда.
 * Спрашивается он только у устранённой записи: у открытой последний осмотр
 * показывает течь, а не её отсутствие.
 */
export function getRepairDonePhoto(leak) {
  const fromRepair = lastEventValue(
    leak,
    LEAK_EVENT_TYPES.REPAIR_DONE,
    "photo",
  );
  if (fromRepair) return fromRepair;
  if (leak?.photo_after) return leak.photo_after;
  if (leak?.status !== "resolved") return null;
  return lastEventValue(leak, LEAK_EVENT_TYPES.INSPECTION, "photo");
}

/**
 * Заменяет снимок у последней починки своего вида.
 *
 * Правка фото в карточке — не новый ремонт, а исправление снимка у того,
 * который уже был: событие остаётся тем же, меняется его вложение.
 *
 * Если события нет, менять нечего — так бывает у записей, заведённых до
 * ленты, и у устранённых обходом, где «фото после» принадлежит осмотру.
 * Тогда возвращается `null`, и вызывающий кладёт снимок туда, где он у такой
 * записи и лежал, — в веху.
 *
 * @param {any} leak
 * @param {string} type
 * @param {string|null} photo
 * @returns {any[]|null} новая лента или `null`, если менять было нечего
 */
export function withReplacedRepairPhoto(leak, type, photo) {
  const events = sortLeakEvents(getLeakEvents(leak));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type !== type) continue;
    const next = [...events];
    next[index] = { ...next[index], photo };
    return next;
  }
  return null;
}
