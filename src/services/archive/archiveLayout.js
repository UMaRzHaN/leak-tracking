import {
  allocateUniqueLeakArchiveSegments,
  sanitizePortableArchiveSegment,
} from "@/services/archive/archivePaths";
import {
  buildMonitoringRoundLookup,
  getRecordRoundNumber,
} from "@/services/excelExport/monitoringRows";
import { getMonitoringRecords } from "@/utils/monitoring";

/**
 * Раскладка снимков в архиве — одна для Excel-архива и ZIP-бэкапа:
 *
 *   photos/LDAR/3242/before.jpg                          — заведение и ремонт
 *   photos/monitoring/2/3242 (утечки нет)/record-1.jpg   — осмотры обхода №2
 *
 * Снимки утечки лежат под одной биркой, без состояния: оно меняется, а
 * папка — нет. У осмотра в скобках итог последнего осмотра утечки в этом
 * обходе: папка обхода рассказывает о том обходе, а не о сегодняшнем дне.
 *
 * Пути записываются в книгу и в `backup.json`, так что при загрузке архива
 * раскладка ни из чего не выводится — пути просто читают.
 */
export const LDAR_FOLDER = "LDAR";
export const MONITORING_FOLDER = "monitoring";

/** Папки снимков утечек: `LDAR/<бирка>`. */
export function toLdarFolders(segments) {
  return segments.map((segment) => `${LDAR_FOLDER}/${segment}`);
}

export function allocateLeakFolderNames(leaks) {
  return toLdarFolders(allocateUniqueLeakArchiveSegments(leaks));
}

function withFolderLabel(segment, label) {
  return label
    ? (sanitizePortableArchiveSegment(`${segment} (${label})`) ?? segment)
    : segment;
}

function recordKey(record) {
  return record?.id != null ? `id:${String(record.id)}` : record;
}

/**
 * Где лежит снимок каждого осмотра: `monitoring/<обход>/<бирка> (<итог>)`,
 * записи нумеруются внутри обхода.
 *
 * Искать место можно по номерам (`byIndex` — так считают листы книги) или по
 * самой записи (`byRecord` — так идёт бэкап по ленте событий). По записи
 * ищется и её идентификатор: осмотр, лежащий и в ленте, и в старом списке,
 * — один осмотр, и снимок у него одно место.
 *
 * @param {any[]} leaks
 * @param {(result: string) => string} labelForResult
 */
export function planRoundMonitoringFolders(leaks, labelForResult) {
  const roundLookup = buildMonitoringRoundLookup(leaks);
  const baseSegments = allocateUniqueLeakArchiveSegments(leaks);
  const byIndex = new Map();
  const byRecord = new Map();

  leaks.forEach((leak, leakIndex) => {
    const rounds = new Map();
    getMonitoringRecords(leak).forEach((record, recordIndex) => {
      const round = getRecordRoundNumber(record, recordIndex, roundLookup);
      if (!rounds.has(round)) rounds.set(round, []);
      rounds.get(round).push({ record, recordIndex });
    });

    for (const [round, entries] of rounds) {
      const roundSegment = `${MONITORING_FOLDER}/${round}`;
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
