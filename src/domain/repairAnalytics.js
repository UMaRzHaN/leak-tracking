import { getRepairDurations, getRepairIterations } from "@/domain/leakEvents";

/**
 * Что лента событий отвечает, когда её спрашивают про весь проект.
 *
 * Вопрос у эксплуатации один и тот же: какие починки не помогли. Раньше
 * ответить было нечем — ремонт лежал на записи одиночными полями, и вторая
 * попытка затирала первую, так что вернувшаяся утечка выглядела как
 * отремонтированная один раз. Считать здесь стало возможно ровно потому, что
 * попытки перестали затирать друг друга.
 *
 * Все числа выводятся из ленты и ничего не хранят: пересчёт дешевле поля,
 * которое разъезжается с событиями после каждого обмена архивом.
 */

/** Медиана, а не среднее: один ремонт, забытый на месяц, сдвигает среднее втрое. */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function lastRepairTime(iterations) {
  let latest = 0;
  for (const { started, done } of iterations) {
    for (const event of [started, done]) {
      const time = Date.parse(String(event?.date ?? ""));
      if (Number.isFinite(time) && time > latest) latest = time;
    }
  }
  return latest;
}

/**
 * @param {any[]} leaks
 * @param {number} [now] точка отсчёта для незакрытых починок
 */
export function buildRepairAnalytics(leaks, now = Date.now()) {
  let repairedLeaks = 0;
  let completed = 0;
  let inProgress = 0;
  const durations = [];
  const returned = [];
  let longestOpenRepair = 0;

  for (const leak of leaks ?? []) {
    const iterations = getRepairIterations(leak);
    if (iterations.length === 0) continue;

    repairedLeaks += 1;
    durations.push(...getRepairDurations(leak));

    for (const { started, done } of iterations) {
      if (done) {
        completed += 1;
        continue;
      }
      inProgress += 1;
      const startedAt = Date.parse(String(started?.date ?? ""));
      if (Number.isFinite(startedAt)) {
        longestOpenRepair = Math.max(longestOpenRepair, now - startedAt);
      }
    }

    // Больше одной попытки — значит, утечка вернулась после починки. Это и
    // есть тот случай, ради которого стоит идти к железу второй раз.
    if (iterations.length > 1) {
      returned.push({
        leak,
        attempts: iterations.length,
        lastRepairAt: lastRepairTime(iterations),
      });
    }
  }

  returned.sort(
    (left, right) =>
      right.attempts - left.attempts || right.lastRepairAt - left.lastRepairAt,
  );

  return {
    repairedLeaks,
    completed,
    inProgress,
    returnedLeaks: returned,
    returned: returned.length,
    medianDuration: median(durations),
    longestOpenRepair: longestOpenRepair || null,
  };
}
