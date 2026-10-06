import { getLeakEvents, toEventDate } from "@/domain/leakEventsCore";

/**
 * Период выгрузки (8a). «Сегодня» — с полуночи, «Неделя» и «Месяц» — последние 7
 * и 30 дней, «Свой» — даты, выбранные руками.
 *
 * Запись попадает в период, если в него легла её дата обнаружения или любое
 * событие ленты: осмотр, ремонт, смена статуса. Раньше считалась только дата
 * обнаружения, и «Неделя» в разгар обхода давала ноль записей — утечки нашли
 * давно, а проверяли как раз на этой неделе.
 */
export const PERIOD = Object.freeze({
  TODAY: "today",
  WEEK: "week",
  MONTH: "month",
  CUSTOM: "custom",
  ALL: "all",
});

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * «2026-10-02» из поля даты — местный день. `Date.parse` читает его как
 * полночь UTC, и к западу от Гринвича «с 2 октября» начиналось с 1-го.
 */
function localDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return Number.NaN;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ).getTime();
}

/** @returns {{ from: number|null, to: number|null }} */
export function periodRange(period, custom = {}, now = Date.now()) {
  const today = startOfDay(now);
  switch (period) {
    case PERIOD.TODAY:
      return { from: today, to: null };
    case PERIOD.WEEK:
      return { from: today - 6 * DAY, to: null };
    case PERIOD.MONTH:
      return { from: today - 29 * DAY, to: null };
    case PERIOD.CUSTOM: {
      const from = localDay(custom.from);
      const to = localDay(custom.to);
      return {
        from: Number.isFinite(from) ? startOfDay(from) : null,
        to: Number.isFinite(to) ? startOfDay(to) + DAY - 1 : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

export function leakTime(leak) {
  const iso = toEventDate(leak?.createdAt) ?? toEventDate(leak?.date);
  const time = Date.parse(iso ?? "");
  return Number.isFinite(time) ? time : null;
}

/** Все моменты жизни записи: обнаружение и события ленты. */
function activityTimes(leak) {
  const times = [leakTime(leak)];
  const legacy = Array.isArray(leak?.monitoringRecords)
    ? leak.monitoringRecords
    : [];
  for (const event of [...getLeakEvents(leak), ...legacy]) {
    const time = Date.parse(toEventDate(event?.date) ?? "");
    times.push(Number.isFinite(time) ? time : null);
  }
  return times.filter((time) => time !== null);
}

/**
 * Даты, которые покрывает выбранный период, — для строки под кнопками (8a).
 * «Всё время» тянется от первого события в данных до сегодня.
 *
 * @returns {{ from: number, to: number }|null}
 */
export function shownRange(range, leaks, now = Date.now()) {
  let from = range.from;
  if (from === null) {
    for (const leak of leaks) {
      for (const time of activityTimes(leak)) {
        if (from === null || time < from) from = time;
      }
    }
  }
  if (from === null) return null;
  const to = range.to ?? now;
  return to < from ? null : { from, to };
}

/** Сколько календарных дней в диапазоне, оба конца включительно. */
export function daysIn({ from, to }) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY) + 1;
}

export function filterByPeriod(leaks, range) {
  if (range.from === null && range.to === null) return leaks;
  const inRange = (time) =>
    (range.from === null || time >= range.from) &&
    (range.to === null || time <= range.to);
  return leaks.filter((leak) => activityTimes(leak).some(inRange));
}

const historyKey = (projectId) =>
  projectId ? `app:${projectId}:export_history_v1` : null;

/** Последние выгрузки (8b) — на этом устройстве, не больше десяти. */
export function readExportHistory(projectId) {
  const key = historyKey(projectId);
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function pushExportHistory(projectId, entry) {
  const key = historyKey(projectId);
  if (!key) return [];
  const next = [entry, ...readExportHistory(projectId)].slice(0, 10);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // История — удобство: без хранилища выгрузка всё равно состоялась.
  }
  return next;
}

const sheetsKey = (projectId) =>
  projectId ? `app:${projectId}:export_sheets_v1` : null;

/** Разделы и фото по умолчанию: всё, как выгружала база. */
export const DEFAULT_EXPORT_SHEETS = Object.freeze({
  repairs: true,
  monitoring: true,
  materials: true,
  inventory: false,
  photos: Object.freeze({
    leaks: true,
    repairs: true,
    monitoring: true,
    inventory: true,
  }),
});

function defaults() {
  return {
    ...DEFAULT_EXPORT_SHEETS,
    photos: { ...DEFAULT_EXPORT_SHEETS.photos },
  };
}

/**
 * Что человек включил в файл (8a) — на этом устройстве, по проекту. Выбор
 * повторяется от выгрузки к выгрузке, и выставлять его каждый раз заново —
 * лишняя работа. Прежняя запись с одним флагом фото читается как «фото
 * везде так же».
 */
export function readExportSheets(projectId) {
  const key = sheetsKey(projectId);
  const result = defaults();
  if (!key) return result;
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    for (const name of ["repairs", "monitoring", "materials", "inventory"]) {
      if (typeof stored?.[name] === "boolean") result[name] = stored[name];
    }
    if (typeof stored?.photos === "boolean") {
      for (const name of Object.keys(result.photos)) {
        result.photos[name] = stored.photos;
      }
    } else {
      for (const name of Object.keys(result.photos)) {
        if (typeof stored?.photos?.[name] === "boolean") {
          result.photos[name] = stored.photos[name];
        }
      }
    }
    return result;
  } catch {
    return result;
  }
}

export function saveExportSheets(projectId, value) {
  const key = sheetsKey(projectId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Не запомнилось — выберут ещё раз; выгрузке это не мешает.
  }
}
