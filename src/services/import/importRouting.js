import { assertImportFileSize, readArchiveEntry } from "@/utils/importLimits";
import { matchAll } from "@/utils/matchAll";
import { openZip } from "@/utils/openZip";

/**
 * Working out what a file is before asking anyone.
 *
 * The screen used to have one button per format, so importing meant knowing
 * whether the thing in your Downloads folder was a backup, a report or an
 * inventory — a question about this app's internals, asked of somebody who
 * has just been handed a file. Everything needed to answer it is in the file.
 *
 * Every format involved is a zip: an .xlsx is a zip with `xl/workbook.xml` in
 * it, and the archives are zips with known files at the root. So one pass over
 * the entry names settles it, without parsing a workbook that may hold ten
 * thousand rows.
 */

/** @typedef {"project"|"inventory"|"excel"|"unknown"} ImportKind */

const WORKBOOK_MARKER = "xl/workbook.xml";
const INVENTORY_SHEET_NAMES = ["inventorization", "inventory", "компоненты"];
const LEAK_SHEET_HINTS = ["утечк", "leak"];

/**
 * Книга инвентаризации — по именам её листов: лист реестра есть, а листа
 * утечек нет (книга с обоими — отчёт по утечкам с реестром на вкладке).
 *
 * @param {string[]} sheets имена листов в нижнем регистре
 */
export function isInventorySheetSet(sheets) {
  const hasLeaks = sheets.some((name) =>
    LEAK_SHEET_HINTS.some((hint) => name.includes(hint)),
  );
  const hasInventory = sheets.some((name) =>
    INVENTORY_SHEET_NAMES.includes(name.trim()),
  );
  return hasInventory && !hasLeaks;
}

export function sheetNamesFromWorkbookXml(xml) {
  return matchAll(String(xml), /<sheet\b[^>]*\bname="([^"]*)"/g).map((match) =>
    match[1].toLowerCase(),
  );
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{kind: ImportKind, reason: string}>}
 */
export async function detectImportKind(file) {
  return detectKind(file, true);
}

/**
 * @param {File|Blob} file
 * @param {boolean} allowNested заглянуть ли во вложенную книгу. Только на
 *   первом уровне: книга в архиве бывает, архив в книге в архиве — нет, а
 *   zip-«квайн» без этого ограничения раскрывал бы себя бесконечно.
 * @returns {Promise<{kind: ImportKind, reason: string}>}
 */
async function detectKind(file, allowNested) {
  // Определение формата — первое, что делается с любым выбранным файлом, так
  // что лимиты импорта действуют уже здесь: иначе zip-бомба роняла WebView
  // раньше, чем до неё доходила защищённая ветка импорта.
  assertImportFileSize(file);

  // Предпроверка — внутри openZip и до разбора: архив с миллионом записей
  // отсекается по каталогу, а не после того, как JSZip построит по объекту на
  // каждую. Загрузчик там же вне try: не загрузившийся jszip это отказ
  // инструмента, а не приговор файлу.
  const zip = await openZip(file, { asArrayBuffer: true, nullIfNotZip: true });
  // Not a zip at all, so not one of the three. The caller says so rather than
  // guessing from the extension.
  if (!zip) return { kind: "unknown", reason: "not-an-archive" };

  const names = Object.keys(zip.files);

  if (names.includes(WORKBOOK_MARKER)) {
    const sheets = sheetNamesFromWorkbookXml(
      await readArchiveEntry(zip, zip.file(WORKBOOK_MARKER), "string"),
    );
    // A workbook holding both is the leak report with the registry as one of
    // its tabs: it goes down the leak route, which reads that tab too.
    if (isInventorySheetSet(sheets)) {
      return { kind: "inventory", reason: "workbook-sheet" };
    }
    return { kind: "excel", reason: "workbook" };
  }

  // backup.json is what the leak import actually reads; project.json only
  // describes the project and rides along with it.
  if (names.includes("backup.json")) {
    return { kind: "project", reason: "backup.json" };
  }

  // Before components.json, not after: the leak export archive carries the
  // registry beside its workbook, and reading that file first would have sent
  // a whole leak report down the inventory route.
  const workbook = names.find(
    (name) => /\.xlsx$/i.test(name) && !name.startsWith("__MACOSX/"),
  );
  if (workbook) {
    if (!allowNested) return { kind: "excel", reason: "zipped-workbook" };
    const inner = await readArchiveEntry(
      zip,
      zip.file(workbook),
      "arraybuffer",
    );
    const nested = await detectKind(
      new Blob([inner], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      false,
    );
    return nested.kind === "inventory"
      ? { kind: "inventory", reason: "zipped-workbook" }
      : { kind: "excel", reason: "zipped-workbook" };
  }

  if (names.includes("components.json")) {
    return { kind: "inventory", reason: "components.json" };
  }

  return { kind: "unknown", reason: "unrecognized-archive" };
}
