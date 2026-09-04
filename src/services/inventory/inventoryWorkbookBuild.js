import { buildComponentSheet } from "@/services/excelExport/componentSheet";
import { buildComponentHistorySheet } from "@/services/inventory/componentHistorySheet";
import { addInventoryBackupSheet } from "@/services/inventory/inventoryBackupSheet";

/**
 * Сборка книги инвентаризации: спецификация листа на входе, буфер на выходе.
 *
 * Отделено от `inventoryArchive` затем же, зачем отделён разбор: этот модуль
 * грузит воркер, и ExcelJS остаётся в его графе. Сам архив — зип со снимками и
 * чертежами — собирается на той стороне, где эти файлы и лежат.
 */

import { INVENTORY_SHEET_NAME } from "@/services/inventory/inventoryNames";

const getExcelJS = () => import("exceljs");

/**
 * A workbook holding nothing but the registry sheet.
 *
 * Written here rather than through the leak export's worker because there is
 * one sheet and no photographs to resolve: the worker exists to keep a
 * thousand-record report off the main thread, and paying its round trip for a
 * single table would be slower, not faster.
 *
 * @param {{name?: string, headers: string[], keysOrder: string[], rows: Record<string, any>[], ids?: string[], components?: Record<string, any>[], fields?: {key?: string, label?: string}[]}} sheetSpec
 * @param {{photoPaths?: Record<string, string>, texts?: Record<string, any>, backup?: Record<string, any>[]|null}} [options]
 *   `backup` — карточки целиком, как они уедут в служебный лист.
 */
export async function buildInventoryWorkbookBuffer(sheetSpec, options = {}) {
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  await buildComponentSheet(
    workbook,
    { ...sheetSpec, name: INVENTORY_SHEET_NAME },
    options,
  );
  // Вторым листом, как у утечек: сначала то, что есть, потом — как это стало
  // таким. Реестр — набор утверждений о железе, и у каждого есть автор.
  await buildComponentHistorySheet(workbook, {
    components: sheetSpec?.components ?? [],
    fields: sheetSpec?.fields ?? [],
    texts: options.texts?.componentHistory ?? {},
  });
  // Последним и скрытым: это страница для машины, и открывший книгу должен
  // сначала увидеть то, ради чего её открыл.
  addInventoryBackupSheet(
    workbook,
    { data: options.backup ?? [] },
    options.texts?.inventoryBackup ?? {},
  );
  return workbook.xlsx.writeBuffer();
}
