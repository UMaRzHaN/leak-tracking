import {
  LEAK_EVENT_TYPES,
  getEventsOfType,
  getLeakEvents,
  sortLeakEvents,
} from "./leakEventsCore";

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
