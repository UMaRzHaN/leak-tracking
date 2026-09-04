import { parseInventorySheet } from "@/services/inventory/inventorySheet";
import { parseInventoryBackupSheet } from "@/services/inventory/inventoryBackupSheet";
import { mergeSheetEditsIntoCards } from "@/services/inventory/inventorySheetMerge";

/**
 * Чтение книги инвентаризации: файл на входе, карточки на выходе.
 *
 * Отделено от `inventoryImport` затем же, зачем `excelImportParse` отделён от
 * своего сервиса: этот модуль грузит воркер, а у воркера нет ни моста
 * Capacitor, ни хранилища, ни DOM. Всё, что пишет карточки и снимки на
 * устройство, осталось на той стороне — здесь только ExcelJS и JSZip.
 *
 * Пока чтение жило рядом с записью, ExcelJS тянулся в граф главного потока —
 * вторая копия библиотеки на 900 кБ, при том что у воркера уже есть своя.
 */

const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

function isWorkbookName(name) {
  return /\.xlsx$/i.test(name) && !name.startsWith("__MACOSX/");
}

async function readWorkbook(data) {
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

export async function openZip(file) {
  const JSZip = (await getJSZip()).default;
  return new JSZip().loadAsync(await file.arrayBuffer());
}

/** Книга инвентаризации — голая или лежащая в архиве. */
async function openInventoryWorkbook(file, openedZip = null) {
  const isZip =
    /\.zip$/i.test(/** @type {File} */ (file)?.name ?? "") ||
    String(file?.type ?? "").includes("zip");

  if (!isZip && !openedZip) return readWorkbook(await file.arrayBuffer());

  const zip = openedZip ?? (await openZip(file));
  const entry = Object.keys(zip.files).find(
    (name) => !zip.files[name].dir && isWorkbookName(name),
  );
  if (!entry) return null;
  // Имя взято из списка того же архива — файл под ним точно есть.
  const workbookEntry = /** @type {any} */ (zip.file(entry));
  return readWorkbook(await workbookEntry.async("arraybuffer"));
}

/**
 * The cards a workbook — loose or inside a zip — has to offer.
 *
 * @param {File|Blob} file
 * @param {{headers: string[], keysOrder: string[]}} excel
 * @returns {Promise<{components: Record<string, any>[], skipped: number}>}
 */
export async function readInventorySheetFile(file, excel) {
  const workbook = await openInventoryWorkbook(file);
  if (!workbook) return { components: [], skipped: 0 };
  return parseInventorySheet(workbook, excel);
}

/**
 * Карточки из служебного листа книги, лежащей в архиве.
 *
 * Снимки здесь не восстанавливаются: они пишутся в хранилище устройства, а
 * это дело вызывающего. Разбор отдаёт карточки, уже сведённые с правками
 * видимого листа — слепок полнее, но игнорировать правки нельзя, иначе они
 * пропадают молча.
 *
 * @returns {Promise<Record<string, any>[]|null>} null — если служебного листа
 *   в архиве нет вовсе.
 */
export async function readInventoryArchiveCards(file, excel) {
  let zip;
  try {
    zip = await openZip(file);
  } catch {
    return null;
  }

  const workbook = await openInventoryWorkbook(file, zip);
  const cards = workbook ? parseInventoryBackupSheet(workbook) : null;
  if (!cards?.length) return null;

  const sheetCards =
    workbook && excel ? parseInventorySheet(workbook, excel).components : [];

  return mergeSheetEditsIntoCards(cards, sheetCards).cards;
}
