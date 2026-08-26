import { matchAll } from "@/utils/matchAll";

const getJSZip = () => import("jszip");

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

function sheetNamesFromWorkbookXml(xml) {
  return matchAll(String(xml), /<sheet\b[^>]*\bname="([^"]*)"/g).map((match) =>
    match[1].toLowerCase(),
  );
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{kind: ImportKind, reason: string}>}
 */
export async function detectImportKind(file) {
  // Загрузчик — вне try: не загрузившийся jszip это отказ инструмента, а не
  // приговор файлу. Пока он был внутри, любая осечка на этой строке выдавала
  // «не удалось понять, что это за файл» — и человек шёл искать беду в
  // исправном архиве.
  const JSZip = (await getJSZip()).default;

  let zip;
  try {
    zip = await new JSZip().loadAsync(await file.arrayBuffer());
  } catch {
    // Not a zip at all, so not one of the three. The caller says so rather
    // than guessing from the extension.
    return { kind: "unknown", reason: "not-an-archive" };
  }

  const names = Object.keys(zip.files);

  if (names.includes(WORKBOOK_MARKER)) {
    const sheets = sheetNamesFromWorkbookXml(
      await zip.file(WORKBOOK_MARKER).async("string"),
    );
    const hasLeaks = sheets.some((name) =>
      LEAK_SHEET_HINTS.some((hint) => name.includes(hint)),
    );
    const hasInventory = sheets.some((name) =>
      INVENTORY_SHEET_NAMES.includes(name.trim()),
    );
    // A workbook holding both is the leak report with the registry as one of
    // its tabs: it goes down the leak route, which reads that tab too.
    if (hasInventory && !hasLeaks) {
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
    const inner = await zip.file(workbook).async("arraybuffer");
    const nested = await detectImportKind(
      new Blob([inner], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
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
