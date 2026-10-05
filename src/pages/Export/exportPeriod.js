import { toEventDate } from "@/domain/leakEventsCore";

/**
 * Период выгрузки (8a). «Смена» — сегодня, «Неделя» и «Месяц» — последние 7
 * и 30 дней, «Свой» — даты, выбранные руками. Запись относится к периоду по
 * дате обнаружения: так её видит и отчёт.
 */
export const PERIOD = Object.freeze({
  SHIFT: "shift",
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

/** @returns {{ from: number|null, to: number|null }} */
export function periodRange(period, custom = {}, now = Date.now()) {
  const today = startOfDay(now);
  switch (period) {
    case PERIOD.SHIFT:
      return { from: today, to: null };
    case PERIOD.WEEK:
      return { from: today - 6 * DAY, to: null };
    case PERIOD.MONTH:
      return { from: today - 29 * DAY, to: null };
    case PERIOD.CUSTOM: {
      const from = Date.parse(custom.from ?? "");
      const to = Date.parse(custom.to ?? "");
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

export function filterByPeriod(leaks, range) {
  if (range.from === null && range.to === null) return leaks;
  return leaks.filter((leak) => {
    const time = leakTime(leak);
    if (time === null) return false;
    if (range.from !== null && time < range.from) return false;
    if (range.to !== null && time > range.to) return false;
    return true;
  });
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
