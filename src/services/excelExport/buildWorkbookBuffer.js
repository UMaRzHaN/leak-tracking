// Straight from the field list rather than the export photo pipeline, which
// re-exports it but also pulls photoService and the Capacitor bridge.
import { LEAK_PHOTO_FIELDS as PHOTO_KEYS } from "@/utils/photoFields";
import { addBackupSheet } from "@/services/excelExport/backupSheet";
import {
  applyColumnFormats,
  toExcelCellValue,
} from "@/services/excelExport/cellValues";
import {
  buildHistorySheet,
  buildMonitoringSheet,
} from "@/services/excelExport/auxiliarySheets";
import { buildComponentSheet } from "@/services/excelExport/componentSheet";
import {
  addStructuredTable,
  getColumnWidth,
  styleBodyRows,
  styleHeaderRow,
  yieldToMainThread,
} from "@/services/excelExport/sheetLayout";

// The workbook-building half of the Excel export, split out of
// pages/DataBase/excel.js so the worker can load it on its own. The rest of
// that file resolves photos through photoService and writes files through the
// Capacitor bridge — neither works inside a worker, and importing the module
// for this code alone dragged that bridge into the worker bundle.
//
// Everything here takes its input from the payload: photos arrive already
// resolved as a photoMap, texts already translated.

const getExcelJS = () => import("exceljs");

const LEAKS_TABLE_THEME = "TableStyleMedium2";
const EXPORT_YIELD_EVERY = 40;

function releaseWorkbook(workbook) {
  if (
    typeof workbook?.removeWorksheet !== "function" ||
    !Array.isArray(workbook.worksheets)
  ) {
    return;
  }

  for (const worksheet of [...workbook.worksheets]) {
    workbook.removeWorksheet(worksheet.id);
  }
}

async function buildWorkbook({
  orderedLeaks,
  orderedRows,
  headers,
  keysOrder,
  photoMap,
  texts,
  ExcelJS,
  monitoringExportMode,
  archivePayload,
  componentSheet,
}) {
  const photoColumnIndexes = PHOTO_KEYS.map((key) =>
    keysOrder.indexOf(key),
  ).filter((index) => index !== -1);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(texts.sheets.leaks);

  const tableRows = orderedRows.map((row, leakIndex) =>
    keysOrder.map((key) => {
      if (PHOTO_KEYS.includes(key) && photoMap[`${leakIndex}:${key}`]) {
        return "";
      }

      return toExcelCellValue(key, row[key]);
    }),
  );

  addStructuredTable(sheet, {
    name: "Leaks",
    headers,
    rows: tableRows,
    theme: LEAKS_TABLE_THEME,
  });
  styleHeaderRow(sheet, "FF1F4E78");
  await styleBodyRows(sheet, orderedRows.length);

  for (const [leakIndex, row] of orderedRows.entries()) {
    if (leakIndex > 0 && leakIndex % EXPORT_YIELD_EVERY === 0) {
      await yieldToMainThread();
    }

    for (const columnIndex of photoColumnIndexes) {
      const key = keysOrder[columnIndex];
      const mapKey = `${leakIndex}:${key}`;
      const photoFile = photoMap[mapKey];
      const cell = sheet.getRow(leakIndex + 2).getCell(columnIndex + 1);

      if (photoFile) {
        cell.value = { text: texts.photo.open, hyperlink: photoFile };
        cell.font = { color: { argb: "FF1155CC" }, underline: true };
      } else {
        cell.value = row[key] ? texts.photo.missing : "";
      }
    }
  }

  applyColumnFormats(sheet, keysOrder);

  headers.forEach((header, index) => {
    const key = keysOrder[index];
    const isPhoto = PHOTO_KEYS.includes(key);
    sheet.getColumn(index + 1).width = getColumnWidth(
      header,
      key,
      orderedRows,
      {
        isPhoto,
      },
    );
  });

  await buildMonitoringSheet(
    workbook,
    orderedLeaks,
    texts,
    photoMap,
    monitoringExportMode,
  );
  await buildHistorySheet(workbook, orderedLeaks, texts);
  // Before the backup sheet, so the registry sits with the readable tabs
  // rather than after the machine-readable one nobody opens by hand.
  await buildComponentSheet(workbook, componentSheet);
  addBackupSheet(workbook, archivePayload, texts);

  return workbook;
}

export async function buildWorkbookBufferLocally(payload) {
  const ExcelJS = (await getExcelJS()).default;
  let workbook = await buildWorkbook({ ...payload, ExcelJS });

  await yieldToMainThread();
  const buffer = await workbook.xlsx.writeBuffer();
  releaseWorkbook(workbook);
  workbook = null;
  await yieldToMainThread();

  return buffer;
}
