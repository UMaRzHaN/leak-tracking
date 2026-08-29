function asFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function compareLeakIds(left, right) {
  const leftId = left?.id;
  const rightId = right?.id;
  const leftNumber = asFiniteNumber(leftId);
  const rightNumber = asFiniteNumber(rightId);

  if (leftNumber != null && rightNumber != null) {
    return leftNumber - rightNumber;
  }

  return String(leftId ?? "").localeCompare(String(rightId ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// `createdAt` is whatever the record was written with: a Date from the form, a
// number from an import, an ISO string once it has been through storage. All
// three have to compare, and anything unreadable has to be told apart from
// epoch zero.
function toTimestamp(value) {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : null;
}

/**
 * Newest first, by the same `createdAt` the cards render as "5 minutes ago".
 *
 * The recent list used to be ordered by `compareLeakIds`, which reads the
 * record id. Imported records carry a numeric id and happened to come out in a
 * sensible order, but anything added in the app gets a random UUID, so a screen
 * headed "last N records" was really showing N records in random order, its own
 * timestamps visibly out of sequence.
 *
 * Records with no readable timestamp sink below the dated ones instead of
 * jumping to the top as epoch zero would, and ties fall back to the id so the
 * order stays stable between renders.
 */
export function compareLeakRecency(left, right) {
  const leftTime = toTimestamp(left?.createdAt);
  const rightTime = toTimestamp(right?.createdAt);

  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftTime != null && rightTime == null) return -1;
  if (leftTime == null && rightTime != null) return 1;

  return compareLeakIds(right, left);
}

/**
 * Запись, добавленная последней, — по времени, а не по месту в массиве.
 *
 * Форма подсказок брала `data[data.length - 1]`. Пока записи только
 * дописывались в конец, это совпадало с замыслом; после импорта — нет. Лист
 * Excel пишется в том порядке, в каком его показывает база, то есть от новых к
 * старым; импорт порядок листа сохраняет, и в конце массива оказывается самая
 * старая запись. Подсказки предлагали значения из неё.
 *
 * @param {object[]} leaks
 * @returns {object|null}
 */
export function findLatestLeak(leaks) {
  /** @type {object|null} */
  let latest = null;
  for (const leak of leaks ?? []) {
    if (!latest || compareLeakRecency(leak, latest) < 0) latest = leak;
  }
  return latest;
}
