/**
 * Правило слияния обходов и разбор отметок времени — отдельно от
 * `projectMeta`: их берёт `projectRounds`, а он входит в первую отрисовку.
 * Через `projectMeta` вместе с ними туда же уезжали расчёт утечек и
 * нормализация переменных — несколько килобайт, не нужных до первого экрана.
 */

export function monitoringRoundFreshness(round) {
  if (!round) return 0;
  return Math.max(parseTime(round.completedAt), parseTime(round.startedAt));
}

/**
 * Какой обход считать текущим после обмена архивами.
 *
 * Обходы упорядочены своим номером — для того он и есть. Раньше здесь
 * сравнивали только время последнего изменения, и это давало две беды сразу.
 *
 * Телефон откатывался назад. Обходчик начал третий обход в десять; напарник в
 * одиннадцать закрыл второй. По времени второй «свежее» — и после обмена
 * текущим на обоих телефонах становился второй, уже завершённый. Точки,
 * пройденные в третьем обходе, снова показывались непройденными, а пройденные
 * во втором — сделанными.
 *
 * И на равенстве стороны расходились. Строгое «больше» означает, что при
 * одинаковых отметках каждый остаётся при своём, а решение принимают обе
 * стороны независимо: два телефона так и жили бы с разными текущими обходами.
 * Поэтому ничья разрешается по идентификатору — не потому, что он что-то
 * значит, а потому, что он одинаково виден обоим.
 *
 * @param {Record<string, any>|null} current
 * @param {Record<string, any>|null} incoming
 * @returns {Record<string, any>|null}
 */
export function resolveMonitoringRound(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;

  const byNumber = roundNumber(incoming) - roundNumber(current);
  if (byNumber !== 0) return byNumber > 0 ? incoming : current;

  // Номер тот же — значит это один и тот же обход, и берётся та его запись,
  // которая знает о нём больше: завершённый свежее начатого.
  const byTime =
    monitoringRoundFreshness(incoming) - monitoringRoundFreshness(current);
  if (byTime !== 0) return byTime > 0 ? incoming : current;

  return String(incoming.id) > String(current.id) ? incoming : current;
}

function roundNumber(round) {
  const number = Number(round?.number);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function parseTime(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const time =
    typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(numeric))
      ? numeric
      : Date.parse(String(value));
  return Number.isFinite(time) && time > 0 ? time : 0;
}
