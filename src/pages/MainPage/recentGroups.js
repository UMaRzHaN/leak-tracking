/**
 * Последние записи главного экрана, разложенные по дням (2b): «Сегодня»,
 * «Вчера», «Раньше». Порядок внутри группы — тот, что пришёл: список уже
 * отсортирован по свежести.
 *
 * Запись без читаемой даты попадает в «Раньше» — так же, как сортировка
 * опускает её под датированные.
 */
export const RECENT_GROUP = Object.freeze({
  TODAY: "today",
  YESTERDAY: "yesterday",
  EARLIER: "earlier",
});

function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toTime(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  const time = (
    Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
  ).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * @param {any[]} leaks
 * @param {number} [now]
 * @returns {Array<{ key: string, leaks: any[] }>} только непустые группы
 */
export function groupRecentLeaks(leaks, now = Date.now()) {
  const today = startOfDay(now);
  const yesterday = startOfDay(today - 1);
  const groups = new Map([
    [RECENT_GROUP.TODAY, []],
    [RECENT_GROUP.YESTERDAY, []],
    [RECENT_GROUP.EARLIER, []],
  ]);

  for (const leak of leaks) {
    const time = toTime(leak?.createdAt);
    const key =
      time != null && time >= today
        ? RECENT_GROUP.TODAY
        : time != null && time >= yesterday
          ? RECENT_GROUP.YESTERDAY
          : RECENT_GROUP.EARLIER;
    groups.get(key).push(leak);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, leaks: list }));
}
