import { allocateUniqueLeakArchiveSegments } from "@/services/archive/archivePaths";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import {
  buildEventPhotoEntries,
  buildLeakPhotoEntries,
  buildMonitoringPhotoEntries,
  buildPhotoMap,
  collectEventPhotoAliases,
} from "@/services/excelExport/photoPipeline";
import {
  buildMonitoringRoundLookup,
  getMonitoringExportRows,
} from "@/services/excelExport/monitoringRows";

/**
 * Снимки книги: что читать с устройства, под какими именами класть в архив и
 * по каким ключам их потом находят листы.
 *
 * Отделено от самой выгрузки: там решают, куда положить файл и как его отдать,
 * а здесь — только про фотографии. Отчёт и архив собираются порознь, потому
 * что отфильтрованная выгрузка должна остаться самодостаточной, не унося
 * снимки записей, скрытых отбором.
 */
async function buildPhotoEntries(
  orderedLeaks,
  idbGet,
  monitoringExportMode,
  photoReadCache,
  archiveRoot = "photos",
) {
  const leakSegments = allocateUniqueLeakArchiveSegments(orderedLeaks);
  const includedMonitoringPhotoKeys =
    monitoringExportMode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? new Set(
          getMonitoringExportRows(
            orderedLeaks,
            buildMonitoringRoundLookup(orderedLeaks),
            monitoringExportMode,
          ).map((row) => row.photoMapKey),
        )
      : null;
  const [leakPhotos, monitoringPhotos] = await Promise.all([
    buildLeakPhotoEntries(
      orderedLeaks,
      leakSegments,
      idbGet,
      photoReadCache,
      archiveRoot,
    ),
    buildMonitoringPhotoEntries(
      orderedLeaks,
      leakSegments,
      idbGet,
      includedMonitoringPhotoKeys,
      photoReadCache,
      archiveRoot,
    ),
  ]);

  // Лента идёт третьей и знает, что уже выгружено: её снимки почти все —
  // те же самые, и второй копии в книге им не нужно. Своё место получают
  // только фото прежних починок, которых больше нет ни в полях, ни в обходах.
  const taken = new Set(
    [...leakPhotos, ...monitoringPhotos].map((entry) => entry.sourcePath),
  );
  const eventPhotos = await buildEventPhotoEntries(
    orderedLeaks,
    leakSegments,
    idbGet,
    taken,
    photoReadCache,
    archiveRoot,
  );

  // Ссылки — отдельно от файлов. Снимок, у которого файл уже есть, копии не
  // получает, но ключ листу ремонтов нужен: без него лист говорит «есть, файл
  // не найден» про то, что лежит в архиве под именем колонки.
  return {
    entries: [...leakPhotos, ...monitoringPhotos, ...eventPhotos],
    aliases: collectEventPhotoAliases(orderedLeaks, taken),
  };
}
// Resolves report + backup photo entries (each holding a full base64 copy of
// one photo) and reduces them down to what the rest of the export actually
// needs going forward: two lightweight path maps and the deduped entry list
// used later by the zip-assembly loop. Keeping this in its own function
// means the larger intermediate arrays below (reportPhotoEntries,
// resolvedReportPhotoEntries, backupPhotoEntries, and the lookup Map built
// from them) become unreachable — and collectible — as soon as this
// function returns, instead of staying resident for the entire, separately
// slow, workbook-building phase that follows in exportToExcelFile.
export async function resolvePhotoExportData({
  orderedLeaks,
  backupLeaks,
  idbGet,
  monitoringExportMode,
  photoReadCache,
}) {
  const { entries: reportPhotoEntries, aliases: reportAliases } =
    await buildPhotoEntries(
      orderedLeaks,
      idbGet,
      monitoringExportMode,
      photoReadCache,
      "photos/report",
    );
  const { entries: backupPhotoEntries, aliases: backupAliases } =
    await buildPhotoEntries(
      backupLeaks,
      idbGet,
      EXCEL_MONITORING_EXPORT_MODE.FULL,
      photoReadCache,
    );
  const backupPhotoPathByLogicalKey = new Map(
    backupPhotoEntries.map((entry) => [entry.logicalKey, entry.photoFileName]),
  );
  const resolvedReportPhotoEntries = reportPhotoEntries.map((entry) => {
    const backupPath = backupPhotoPathByLogicalKey.get(entry.logicalKey);
    return backupPath ? { ...entry, photoFileName: backupPath } : entry;
  });
  const photoEntries = [
    ...new Map(
      [...resolvedReportPhotoEntries, ...backupPhotoEntries].map((entry) => [
        entry.photoFileName,
        entry,
      ]),
    ).values(),
  ];
  // Путь у ссылки берётся уже после подстановки путей архива: до неё имя
  // файла, на который она указывает, ещё не окончательное.
  const resolveAliases = (aliases, entries) => {
    const pathBySource = new Map(
      entries.map((entry) => [entry.sourcePath, entry.photoFileName]),
    );
    return aliases
      .map(({ mapKey, sourcePath }) => ({
        mapKey,
        photoFileName: pathBySource.get(sourcePath),
      }))
      .filter((alias) => Boolean(alias.photoFileName));
  };
  const photoMap = buildPhotoMap([
    ...resolvedReportPhotoEntries,
    ...resolveAliases(reportAliases, resolvedReportPhotoEntries),
  ]);
  const backupPhotoMap = buildPhotoMap([
    ...backupPhotoEntries,
    ...resolveAliases(backupAliases, backupPhotoEntries),
  ]);

  return { photoMap, backupPhotoMap, photoEntries };
}
