import {
  allocateUniqueLeakArchiveSegments,
  sanitizePortableArchiveSegment,
} from "@/services/archive/archivePaths";
import {
  buildMonitoringRoundLookup,
  getRecordRoundNumber,
} from "@/services/excelExport/monitoringRows";
import { getMonitoringRecords } from "@/utils/monitoring";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";

/**
 * Раскладка снимков в архиве — одна для Excel-архива и ZIP-бэкапа:
 *
 *   photos/LDAR/УПГ-1/3242/before.jpg                    — заведение и ремонт
 *   photos/monitoring/2/УПГ-1/3242 (утечки нет)/record-1.jpg — осмотры обхода №2
 *
 * Снимки утечки лежат под одной биркой, без состояния: оно меняется, а
 * папка — нет. У осмотра в скобках итог последнего осмотра утечки в этом
 * обходе: папка обхода рассказывает о том обходе, а не о сегодняшнем дне.
 * Перед биркой — первый уровень места (подразделение, УМГ, населённый пункт),
 * и у LDAR, и у обхода: записи разбирают по участкам, и снимки одного участка
 * должны лежать рядом. Снимки ремонтов лежат в папке утечки и делятся так же;
 * снимки реестра компонентов — тоже (см. `placeFolder`).
 *
 * Пути записываются в книгу и в `backup.json`, так что при загрузке архива
 * раскладка ни из чего не выводится — пути просто читают.
 */
export const LDAR_FOLDER = "LDAR";
export const MONITORING_FOLDER = "monitoring";

/**
 * Папка места первого уровня для записи: значение поля, а без значения —
 * подпись «не указано». Без поля (тип проекта неизвестен) — `null`, и папки
 * места нет вовсе.
 *
 * @param {any} record утечка или компонент
 * @param {{ placeField?: string|null, noPlace?: string }} [place]
 * @returns {string|null}
 */
export function placeFolder(record, { placeField = null, noPlace = "-" } = {}) {
  if (!placeField) return null;
  return (
    sanitizePortableArchiveSegment(record?.[placeField]) ??
    sanitizePortableArchiveSegment(noPlace) ??
    "-"
  );
}

/**
 * Папки снимков утечек: `LDAR/<место первого уровня>/<бирка>`, без поля места
 * — `LDAR/<бирка>`. Бирки уникальны на весь проект, так что папка места их
 * не разводит, а только группирует.
 *
 * @param {string[]} segments бирки, по одной на утечку
 * @param {any[]} [leaks] те же утечки в том же порядке
 * @param {{ placeField?: string|null, noPlace?: string }} [place]
 */
export function toLdarFolders(segments, leaks = [], place = {}) {
  return segments.map((segment, index) => {
    const folder = placeFolder(leaks[index], place);
    return folder
      ? `${LDAR_FOLDER}/${folder}/${segment}`
      : `${LDAR_FOLDER}/${segment}`;
  });
}

export function allocateLeakFolderNames(leaks, place = {}) {
  return toLdarFolders(allocateUniqueLeakArchiveSegments(leaks), leaks, place);
}

function withFolderLabel(segment, label) {
  return label
    ? (sanitizePortableArchiveSegment(`${segment} (${label})`) ?? segment)
    : segment;
}

/** Поле первого уровня места для типа проекта; `null` — тип неизвестен. */
export function monitoringPlaceField(projectType) {
  return PROJECT_LOCATION_CONFIG[projectType]?.main ?? null;
}

function recordKey(record) {
  return record?.id != null ? `id:${String(record.id)}` : record;
}

/**
 * Где лежит снимок каждого осмотра:
 * `monitoring/<обход>/<место первого уровня>/<бирка> (<итог>)`, записи
 * нумеруются внутри обхода. Без поля места — прежнее `monitoring/<обход>/…`.
 *
 * Искать место можно по номерам (`byIndex` — так считают листы книги) или по
 * самой записи (`byRecord` — так идёт бэкап по ленте событий). По записи
 * ищется и её идентификатор: осмотр, лежащий и в ленте, и в старом списке,
 * — один осмотр, и снимок у него одно место.
 *
 * @param {any[]} leaks
 * @param {(result: string) => string} labelForResult
 * @param {{ placeField?: string|null, noPlace?: string }} [options]
 */
export function planRoundMonitoringFolders(
  leaks,
  labelForResult,
  { placeField = null, noPlace = "-" } = {},
) {
  const roundLookup = buildMonitoringRoundLookup(leaks);
  const baseSegments = allocateUniqueLeakArchiveSegments(leaks);
  const byIndex = new Map();
  const byRecord = new Map();

  leaks.forEach((leak, leakIndex) => {
    const place = placeFolder(leak, { placeField, noPlace });
    const rounds = new Map();
    getMonitoringRecords(leak).forEach((record, recordIndex) => {
      const round = getRecordRoundNumber(record, recordIndex, roundLookup);
      if (!rounds.has(round)) rounds.set(round, []);
      rounds.get(round).push({ record, recordIndex });
    });

    for (const [round, entries] of rounds) {
      const roundSegment = place
        ? `${MONITORING_FOLDER}/${round}/${place}`
        : `${MONITORING_FOLDER}/${round}`;
      const lastResult = entries[entries.length - 1].record.result;
      const leakSegment = withFolderLabel(
        baseSegments[leakIndex],
        labelForResult(lastResult),
      );
      entries.forEach(({ record, recordIndex }, position) => {
        const placement = {
          roundSegment,
          leakSegment,
          recordNumber: position + 1,
        };
        byIndex.set(`${leakIndex}:${recordIndex}`, placement);
        byRecord.set(recordKey(record), placement);
      });
    }
  });

  return {
    byIndex: (leakIndex, recordIndex) =>
      byIndex.get(`${leakIndex}:${recordIndex}`) ?? null,
    byRecord: (record) => byRecord.get(recordKey(record)) ?? null,
  };
}
