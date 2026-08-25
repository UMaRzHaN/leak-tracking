import { appError } from "@/utils/appError";

/**
 * Что эта вкладка знает о ревизии проекта — и отказ, когда её обогнали.
 *
 * Ревизия конверта выдаётся как «максимум из известных плюс один», поэтому
 * запись выигрывает по построению: кто пишет последним, тот и прав. Внутри
 * одной вкладки это верно — записи выстроены в очередь. Между вкладками —
 * нет: вторая вкладка держит в памяти набор, прочитанный до правок первой, и,
 * сохраняясь, откатывает их целиком. Молча.
 *
 * На Android с единственным WebView такого не бывает; это про веб.
 *
 * Здесь только обнаружение. Слияние правок обеих вкладок — отдельная задача,
 * и она упирается в удаление: у утечки нет надгробия, поэтому слияние по
 * свежести полей воскресило бы удалённое. Отказ такого вопроса не задаёт и
 * решает главное — потеря перестаёт быть незаметной.
 */

/**
 * Ключ записи → самая свежая ревизия, которую эта вкладка прочитала или
 * записала сама. Ключ, а не идентификатор проекта: у проекта несколько
 * наборов, и у каждого своя ревизия.
 *
 * @type {Map<string, number>}
 */
const seenRevisions = new Map();

/**
 * Только настоящее число и ничего кроме.
 *
 * Через `Number()` сюда проходили `null` и пустая строка — обе дают 0. Ноль
 * меньше любой реальной ревизии, поэтому отсутствующее значение, записанное в
 * память, превращало следующее же сохранение в «проект изменён в другой
 * вкладке». Ложный отказ блокирует работу постоянно, в отличие от ошибки,
 * ради которой всё затевалось.
 */
function revisionOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Запоминает ревизию, которую вкладка видела своими глазами.
 *
 * Зовётся на каждом чтении и каждой записи конверта, а не в местах, где
 * проверяется конфликт. Пропущенный вызов означал бы ложный отказ — а он хуже
 * исходной ошибки: та теряет данные изредка, этот блокирует сохранение
 * постоянно.
 *
 * @param {string} key
 * @param {unknown} revision
 */
export function rememberRevision(key, revision) {
  const next = revisionOf(revision);
  if (next == null) return;
  const current = seenRevisions.get(key);
  if (current == null || next > current) seenRevisions.set(key, next);
}

/** @param {string} key */
export function forgetRevision(key) {
  seenRevisions.delete(key);
}

/** Ревизия, на которой основано то, что вкладка держит в памяти. @param {string} key */
export function lastSeenRevision(key) {
  return seenRevisions.get(key) ?? null;
}

/**
 * Бросает, если в хранилище лежит ревизия свежее той, на которой основана
 * память вкладки.
 *
 * Отсутствие запомненной ревизии — не конфликт: так выглядит первая запись
 * нового проекта и любой путь, не начинавшийся с чтения. Сомнение трактуется
 * в пользу записи, потому что цена ложного отказа выше.
 *
 * @param {string} key
 * @param {Array<unknown>} storedRevisions ревизии всех копий набора
 */
export function assertNotOverwritingNewer(key, storedRevisions) {
  const seen = seenRevisions.get(key);
  if (seen == null) return;

  const stored = storedRevisions
    .map(revisionOf)
    .filter((revision) => revision != null);
  if (stored.length === 0) return;

  const newest = Math.max(...stored);
  if (newest <= seen) return;

  const error = appError(
    "PROJECT_CHANGED_ELSEWHERE",
    "Проект изменён в другой вкладке. Обновите страницу, чтобы не потерять те правки.",
  );
  error.seenRevision = seen;
  error.storedRevision = newest;
  throw error;
}

export function resetRevisionMemoryForTests() {
  seenRevisions.clear();
}
