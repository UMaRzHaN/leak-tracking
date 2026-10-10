import {
  applyColumnFormats,
  parseTimestamp,
  toExcelCellValue,
} from "@/services/excelExport/cellValues";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
} from "@/services/excelExport/sheetLayout";
import { getInspectionsWithPreviousPhoto } from "@/domain/componentPhotos";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  keepLatestPerRound,
} from "@/utils/excelExportMode";

/**
 * «Сверка» — обходы инвентаризации листом: строка на каждый осмотр
 * компонента, с номером обхода, в котором его осмотрели.
 *
 * Отдельно от «Истории», как у утечек обход отделён от журнала: история —
 * кто и что менял в карточке, сверка — что нашли на площадке и когда. В
 * режиме «последняя в обходе» на компонент в каждом обходе остаётся один
 * осмотр; осмотры без номера (до того, как его стали писать) — все.
 */

const RECONCILE_TABLE_THEME = "TableStyleMedium7";

const KEYS = [
  "round",
  "date",
  "time",
  "component_uid",
  "scheme_tag",
  "component",
  "object",
  "to",
  "comment",
  "user",
  "previousPhoto",
  "photo",
];

const PHOTO_COLUMNS = ["previousPhoto", "photo"];
const ARCHIVE_PREFIX = "zip:";

/**
 * Путь снимка внутри архива — тот, на который ссылается ячейка, — или null.
 *
 * Карточки в архиве переписаны на `zip:Photos/…`; ссылка ставится только на
 * то, что действительно легло в архив: выгрузка без фото пути оставляет, а
 * файлов не кладёт.
 *
 * @param {any} path
 * @param {Set<string>} archived
 */
function archivedPhotoLink(path, archived) {
  const value = String(path ?? "");
  if (!value.startsWith(ARCHIVE_PREFIX)) return null;
  const inArchive = value.slice(ARCHIVE_PREFIX.length);
  return archived.has(inArchive) ? inArchive : null;
}

/**
 * @param {Record<string, any>[]} components
 * @param {Record<string, any>} texts
 * @param {string} [mode] режим листа: все осмотры или последний в обходе
 * @param {{ archived?: Record<string, any>[]|null, archivedPhotos?: string[] }} [photos]
 *   `archived` — те же карточки, как они уехали в архив (снимки — пути
 *   `zip:…`); `archivedPhotos` — файлы, которые в архив действительно легли.
 */
export function buildReconcileRows(components, texts, mode, photos = {}) {
  const archivedById = new Map(
    (photos.archived ?? []).map((card) => [card?.id, card]),
  );
  const archived = new Set(photos.archivedPhotos ?? []);
  const rows = (components ?? []).flatMap((component, index) =>
    // История — из архивной копии карточки: в ней снимки уже под путями
    // архива. Без неё — своя, и ссылок на снимки нет.
    getInspectionsWithPreviousPhoto(
      archivedById.get(component?.id) ?? component,
    ).map((entry) => ({
      index,
      dateRaw: entry.date,
      round: Number.isFinite(entry.roundNumber) ? entry.roundNumber : "",
      roundNumber: entry.roundNumber,
      date: parseTimestamp(entry.date) ?? "",
      time: parseTimestamp(entry.date) ?? "",
      component_uid: component.component_uid ?? "",
      scheme_tag: component.scheme_tag ?? "",
      component: component.component ?? "",
      object: component.object ?? "",
      to: entry.to ?? "",
      comment: entry.comment ?? "",
      user: entry.user ?? texts.unknownUser ?? "",
      previousPhoto: entry.previousPhoto ?? "",
      previousPhotoLink: archivedPhotoLink(entry.previousPhoto, archived),
      photo: entry.photo ?? "",
      photoLink: archivedPhotoLink(entry.photo, archived),
    })),
  );
  const kept =
    mode === EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND
      ? keepLatestPerRound(rows, {
          keyOf: (row) => row.index,
          roundOf: (row) => row.roundNumber,
          timeOf: (row) => Date.parse(String(row.dateRaw ?? "")),
        })
      : rows;
  // По времени, как журнал: лист читают сверху вниз, обход за обходом.
  return [...kept].sort(
    (left, right) =>
      Date.parse(String(left.dateRaw ?? "")) -
      Date.parse(String(right.dateRaw ?? "")),
  );
}

/**
 * @param {any} workbook
 * @param {{components: Record<string, any>[], texts?: Record<string, any>, mode?: string, archived?: Record<string, any>[]|null, archivedPhotos?: string[]}} spec
 */
export async function buildReconcileSheet(workbook, spec) {
  const { components, texts = {}, mode, archived, archivedPhotos } = spec ?? {};
  const rows = buildReconcileRows(components, texts, mode, {
    archived,
    archivedPhotos,
  });
  // Пустой вкладки нет: компоненты ещё ни разу не осматривали.
  if (rows.length === 0) return;

  const sheet = workbook.addWorksheet(texts.sheet ?? "Сверка");
  const headers = KEYS.map((key) => texts.headers?.[key] ?? key);

  addStructuredTable(sheet, {
    name: "ComponentReconcile",
    headers,
    // Ячейки снимков заполняются ниже: ссылка — свойство ячейки.
    rows: rows.map((row) =>
      KEYS.map((key) =>
        PHOTO_COLUMNS.includes(key) ? "" : toExcelCellValue(key, row[key]),
      ),
    ),
    theme: RECONCILE_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF4BACC6");
  await styleBodyRows(sheet, rows.length);
  rows.forEach((row, rowIndex) => {
    for (const key of PHOTO_COLUMNS) {
      const cell = sheet.getRow(rowIndex + 2).getCell(KEYS.indexOf(key) + 1);
      const link = row[`${key}Link`];
      if (link) {
        cell.value = { text: texts.photoOpen ?? link, hyperlink: link };
        cell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        cell.value = row[key] ? (texts.photoMissing ?? "") : "";
      }
    }
  });
  applyColumnFormats(sheet, KEYS);

  KEYS.forEach((key, index) => {
    sheet.getColumn(index + 1).width = getColumnWidth(
      headers[index],
      key,
      rows,
      { isPhoto: PHOTO_COLUMNS.includes(key) },
    );
  });
}
