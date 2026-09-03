import { getIntlLocale } from "@/utils/locale";
import { LEAK_EVENT_TYPES, getEventsOfType } from "@/domain/leakEvents";
export const MONITORING_RESULT = {
  STILL_LEAKING: "still_leaking",
  RESOLVED: "resolved",
  NEEDS_RECHECK: "needs_recheck",
};

export const MONITORING_RESULT_ORDER = [
  MONITORING_RESULT.STILL_LEAKING,
  MONITORING_RESULT.NEEDS_RECHECK,
  MONITORING_RESULT.RESOLVED,
];

const RESULT_LABELS = {
  ru: {
    still_leaking: "Утечка есть",
    resolved: "Утечки нет",
    needs_recheck: "В ремонте",
  },
  en: {
    still_leaking: "Leak present",
    resolved: "No leak",
    needs_recheck: "Under repair",
  },
};

const MONITORING_ANSWER_LABELS = {
  ru: {
    still_leaking: "Да",
    resolved: "Нет",
    needs_recheck: "В ремонте",
  },
  en: {
    still_leaking: "Yes",
    resolved: "No",
    needs_recheck: "Under repair",
  },
};
const LEGACY_MONITORING_RESULT_LABELS = [
  "Утечка сохраняется",
  "Утечка устранена",
  "Утечка в ремонте",
  "Да",
  "Нет",
  "Still leaking",
  "Resolved",
  "Leak under repair",
];
export function getMonitoringResultLabel(result, lang = "ru") {
  return (
    RESULT_LABELS[lang]?.[result] ??
    RESULT_LABELS.ru[result] ??
    String(result ?? "")
  );
}
export function getMonitoringAnswerLabel(result, lang = "ru") {
  return (
    MONITORING_ANSWER_LABELS[lang]?.[result] ??
    MONITORING_ANSWER_LABELS.ru[result] ??
    getMonitoringResultLabel(result, lang)
  );
}

const MONITORING_RESULT_PREFIXES = Object.values(RESULT_LABELS)
  .flatMap((labels) => Object.values(labels))
  .concat(
    Object.values(MONITORING_ANSWER_LABELS).flatMap((labels) =>
      Object.values(labels),
    ),
  )
  .concat(LEGACY_MONITORING_RESULT_LABELS)
  .sort((left, right) => right.length - left.length);

export function getMonitoringHistoryComment(entry) {
  const text = String(entry?.text ?? "").trim();
  if (!text || entry?.action !== "monitoring") return text;

  for (const prefix of MONITORING_RESULT_PREFIXES) {
    if (text === prefix) return "";
    if (text.startsWith(`${prefix} `)) return text.slice(prefix.length).trim();
  }

  return text;
}

/**
 * Записи обходов утечки.
 *
 * Без даты запись не запись: по ней их упорядочивают, и ниже её читают без
 * проверки. Отсев здесь — это и есть обещание, поэтому дата в возвращаемом
 * типе обязательна, в отличие от самой `MonitoringRecord`, где она может
 * отсутствовать у записи, ещё не дошедшей до этого отсева.
 *
 * @param {import("@/types/domain").LeakRecord|null|undefined} leak
 * @returns {(import("@/types/domain").MonitoringRecord & {date: string})[]}
 */
/**
 * Обходы записи — из ленты событий и из старого списка сразу.
 *
 * Оба, а не один: пока обход пишется в оба места, они совпадают, но между
 * записью и следующим чтением из хранилища в старый список успевает добавить
 * импорт книги — и осмотр, показанный только после перезагрузки проекта,
 * выглядел бы потерянным. Общий номер записи не даёт ему задвоиться.
 *
 * @param {any} leak
 * @returns {any[]}
 */
export function getAllMonitoringRecords(leak) {
  const inspections = getEventsOfType(leak, LEAK_EVENT_TYPES.INSPECTION);
  const known = new Set(
    inspections.map((event) => String(event?.id ?? "")).filter(Boolean),
  );
  const legacy = (
    Array.isArray(leak?.monitoringRecords) ? leak.monitoringRecords : []
  ).filter((record) => !known.has(String(record?.id ?? "")));

  return [...inspections, ...legacy];
}

/**
 * Те же обходы, но только датированные и по порядку.
 *
 * Дата обязательна почти всем читателям: по ней считают текущий обход, ищут
 * последний и раскладывают строки выгрузки. Недатированная запись им не
 * годится — а поиску по базе годится, и он берёт `getAllMonitoringRecords`.
 *
 * Порядок — по дате: последний обход спрашивают чаще всего, и до сих пор он
 * получался последним лишь потому, что список пополнялся с конца.
 *
 * @param {import("@/types/domain").LeakRecord|null|undefined} leak
 * @returns {(import("@/types/domain").MonitoringRecord & {date: string})[]}
 */
export function getMonitoringRecords(leak) {
  return /** @type {(import("@/types/domain").MonitoringRecord & {date: string})[]} */ (
    getAllMonitoringRecords(leak)
      .filter((record) => Boolean(record?.date))
      .sort(
        (left, right) =>
          Date.parse(String(left.date)) - Date.parse(String(right.date)),
      )
  );
}

/**
 * @param {import("@/types/domain").LeakRecord|null|undefined} leak
 * @returns {import("@/types/domain").MonitoringRecord|null}
 */
export function getLastMonitoringRecord(leak) {
  const records = getMonitoringRecords(leak);
  if (records.length === 0) return null;

  return records.reduce((latest, record) => {
    const latestTime = Date.parse(latest.date);
    const recordTime = Date.parse(record.date);
    return recordTime > latestTime ? record : latest;
  }, records[0]);
}

export function getLatestMonitoringPhotoPath(leak) {
  const recordsWithPhoto = getMonitoringRecords(leak).filter(
    (record) => record.photo,
  );
  if (recordsWithPhoto.length === 0) return null;

  return recordsWithPhoto.reduce((latest, record) => {
    const latestTime = Date.parse(latest.date);
    const recordTime = Date.parse(record.date);
    return recordTime > latestTime ? record : latest;
  }, recordsWithPhoto[0]).photo;
}

export function getLeakDetailsHeroPhotoPath(leak) {
  return getLatestMonitoringPhotoPath(leak) ?? leak?.photo ?? null;
}

export function isMonitoringDue(
  leak,
  roundId = /** @type {any} */ (null),
  roundNumber = /** @type {number|null} */ (null),
) {
  const records = getMonitoringRecords(leak);
  const normalizedRoundNumber = Number(roundNumber);
  const hasRoundNumber =
    Number.isFinite(normalizedRoundNumber) && normalizedRoundNumber > 0;
  if (!roundId && !hasRoundNumber) return records.length === 0;

  return !records.some((record) => {
    if (roundId && record.roundId === roundId) return true;
    return (
      !record.roundId &&
      hasRoundNumber &&
      Number(record.roundNumber) === normalizedRoundNumber
    );
  });
}

export function formatMonitoringDate(value, lang = "ru") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(getIntlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
