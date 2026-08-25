import { liveComponents } from "@/domain/componentTombstones";
import { getCellDisplayValue } from "@/services/import/workbookSchema";

/**
 * Реестр внутри самой книги, скрытым листом.
 *
 * Раньше карточки ехали рядом отдельным `components.json`, и это выглядело
 * так, будто архив собран наспех: у отчёта по утечкам никакого json рядом нет,
 * потому что всё, что нужно машине, лежит в книге на служебном листе. Здесь
 * теперь так же — один файл, который человек открывает и читает, и он же
 * возвращается обратно без потерь.
 *
 * Лист устроен как «Project Backup» у утечек: маркер в первой строке, сам
 * реестр строками нарезанного JSON в двух скрытых столбцах и короткая сводка
 * рядом — чтобы открывший книгу видел, что это служебная страница, а не
 * испорченные данные.
 */

const SHEET_NAME = "Inventory Backup";
const MARKER = "LEAK_TRACKER_INVENTORY_BACKUP";
export const INVENTORY_BACKUP_VERSION = 1;

/*
 * Ячейка Excel вмещает 32 767 знаков. Режем с запасом: карточка с длинным
 * наименованием и историей правок легко даёт несколько килобайт, и упереться
 * в предел на чьём-то реальном обходе — значит потерять весь реестр.
 */
const CHUNK_SIZE = 30_000;

/**
 * @param {any} workbook
 * @param {{version?: number, exportedAt?: number, data: Record<string, any>[]}} payload
 * @param {{sheet?: string, note?: string, fieldColumn?: string, valueColumn?: string, summary?: Record<string, any>}} [texts]
 */
export function addInventoryBackupSheet(workbook, payload, texts = {}) {
  const cards = Array.isArray(payload?.data) ? payload.data : [];
  if (cards.length === 0) return;

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.addRow([MARKER, INVENTORY_BACKUP_VERSION, texts.sheet ?? SHEET_NAME]);
  sheet.addRow(["Chunk", "Payload", texts.note ?? ""]);

  const serialized = JSON.stringify({
    version: payload.version ?? INVENTORY_BACKUP_VERSION,
    exportedAt: payload.exportedAt ?? Date.now(),
    data: cards,
  });
  for (let offset = 0, index = 1; offset < serialized.length; index += 1) {
    sheet.addRow([index, serialized.slice(offset, offset + CHUNK_SIZE)]);
    offset += CHUNK_SIZE;
  }

  const summary = texts.summary ?? {};
  // Лист везёт и записи об удалённых карточках — иначе удаление не доедет до
  // второго устройства, — но в сводке человеку показывают карточки.
  const live = liveComponents(cards);
  const withPhoto = live.filter((card) => card?.photo).length;
  const rows = [
    [summary.components, live.length],
    [summary.withPhoto, withPhoto],
    [summary.version, INVENTORY_BACKUP_VERSION],
  ].filter(([label]) => label);

  const headerRow = 4;
  for (
    let rowNumber = sheet.rowCount + 1;
    rowNumber < headerRow;
    rowNumber += 1
  ) {
    sheet.addRow([]);
  }
  sheet.getRow(headerRow).getCell(3).value = texts.fieldColumn ?? "";
  sheet.getRow(headerRow).getCell(4).value = texts.valueColumn ?? "";
  rows.forEach(([label, value], index) => {
    const row = sheet.getRow(headerRow + index + 1);
    row.getCell(3).value = label;
    row.getCell(4).value = value;
    row.getCell(3).font = { bold: true, color: { argb: "FF3F3F3F" } };
  });

  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8064A2" },
  };
  header.alignment = { vertical: "middle", horizontal: "center" };

  // Служебные столбцы прячутся: человеку они ничего не говорят, а ширина
  // в сто знаков растянула бы книгу на пол-экрана.
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(2).hidden = true;
  sheet.getColumn(3).width = 30;
  sheet.getColumn(4).width = 24;
  const first = sheet.getRow(1);
  first.font = { bold: true, color: { argb: "FFFFFFFF" } };
  first.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF7030A0" },
  };
}

/**
 * Карточки из служебного листа книги, или null, если листа там нет.
 *
 * Не бросает на чужой книге — её просто читают дальше обычным разбором листа;
 * бросает только на своей же, но испорченной, потому что молча прочитать
 * половину реестра хуже, чем сказать, что файл сломан.
 *
 * @param {any} workbook
 * @returns {Record<string, any>[]|null}
 */
export function parseInventoryBackupSheet(workbook) {
  const sheet = workbook?.getWorksheet?.(SHEET_NAME);
  if (!sheet) return null;
  if (String(getCellDisplayValue(sheet.getRow(1).getCell(1))) !== MARKER) {
    return null;
  }

  const chunks = [];
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const index = Number(getCellDisplayValue(row.getCell(1)));
    const chunk = getCellDisplayValue(row.getCell(2));
    if (Number.isInteger(index) && index > 0 && typeof chunk === "string") {
      chunks.push({ index, chunk });
    }
  }
  if (chunks.length === 0) return [];

  chunks.sort((left, right) => left.index - right.index);
  let payload;
  try {
    payload = JSON.parse(chunks.map((entry) => entry.chunk).join(""));
  } catch (error) {
    throw new Error("Inventory Backup sheet contains invalid data", {
      cause: error,
    });
  }

  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}
