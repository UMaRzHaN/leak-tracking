// Правка обходов в книге Excel-архива — для `merge-monitoring-rounds.mjs`.
//
// Книга правится по месту, в XML, а не пересобирается через ExcelJS: в листах
// «Утечки» и «Мониторинг» лежат тысячи ссылок на файлы фотографий, и полный
// круг чтения-записи переставляет их отношения. Меняются ровно три части:
// скрытые куски резервной копии, столбец обхода на листе осмотров и сводка.
import JSZip from "jszip";

const BACKUP_SHEET_NAME = "Project Backup";
const MONITORING_TABLE_NAME = "Monitoring";
// Куски резервной копии начинаются с третьей строки листа.
const BACKUP_FIRST_CHUNK_ROW = 3;
// Порядок столбцов листа осмотров задан `buildMonitoringSheet`: номер, тег,
// обход. Заголовок столбца переведён, а его место — нет.
const ROUND_COLUMN_OFFSET = 2;
// Сводка на листе копии: шапка в четвёртой строке, дальше строки из
// `addBackupSheet` по порядку. Подписи переведены, порядок постоянен.
const SUMMARY_FIRST_ROW = 5;
const SUMMARY_CURRENT_ROUND = SUMMARY_FIRST_ROW + 6;
const SUMMARY_CHECKED = SUMMARY_FIRST_ROW + 7;
const SUMMARY_REMAINING = SUMMARY_FIRST_ROW + 9;

const XML_ESCAPES = [
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&apos;"],
];

function escapeXml(text) {
  return XML_ESCAPES.reduce(
    (result, [plain, entity]) => result.split(plain).join(entity),
    text,
  );
}

function unescapeXml(text) {
  return [...XML_ESCAPES]
    .reverse()
    .reduce(
      (result, [plain, entity]) => result.split(entity).join(plain),
      text,
    );
}

function columnName(index) {
  let name = "";
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function columnIndex(name) {
  return [...name].reduce(
    (total, letter) => total * 26 + (letter.charCodeAt(0) - 64),
    0,
  );
}

async function readText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`В книге нет ${path}`);
  return file.async("string");
}

/** Листы книги по именам: имя → путь к XML. */
async function readSheetPaths(zip) {
  const workbook = await readText(zip, "xl/workbook.xml");
  const rels = await readText(zip, "xl/_rels/workbook.xml.rels");
  const targets = new Map(
    [
      ...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g),
    ].map(([, id, target]) => [id, `xl/${target.replace(/^\/?xl\//, "")}`]),
  );
  return new Map(
    [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(
      ([, name, id]) => [unescapeXml(name), targets.get(id)],
    ),
  );
}

/** Лист осмотров и столбец обхода на нём — по имени таблицы, не по подписям. */
async function findMonitoringRoundColumn(zip, sheetPaths) {
  for (const path of sheetPaths.values()) {
    const relsPath = path
      .replace(/^xl\/worksheets\//, "xl/worksheets/_rels/")
      .concat(".rels");
    if (!zip.file(relsPath)) continue;
    const rels = await readText(zip, relsPath);
    for (const [, target] of rels.matchAll(/Target="([^"]*tables\/[^"]+)"/g)) {
      const table = await readText(
        zip,
        `xl/${target.replace(/^(\.\.\/|\/?xl\/)/, "")}`,
      );
      const name = /<table[^>]*\sname="([^"]+)"/.exec(table)?.[1];
      const ref = /<table[^>]*\sref="([A-Z]+)\d+:/.exec(table)?.[1];
      if (name === MONITORING_TABLE_NAME && ref) {
        return {
          path,
          column: columnName(columnIndex(ref) + ROUND_COLUMN_OFFSET),
        };
      }
    }
  }
  throw new Error("В книге нет листа осмотров");
}

/** Куски резервной копии: номер в столбце A, строка — в общих строках. */
function readChunkCells(sheetXml) {
  const cells = [];
  for (const [, row, body] of sheetXml.matchAll(
    /<row r="(\d+)"[^>]*>(.*?)<\/row>/gs,
  )) {
    // Первые две строки — метка и шапка; там в тех же столбцах лежат подписи,
    // и по виду ячеек они от кусков копии неотличимы.
    if (Number(row) < BACKUP_FIRST_CHUNK_ROW) continue;
    const index = new RegExp(`<c r="A${row}"[^>]*><v>(\\d+)</v>`).exec(body);
    const payload = new RegExp(
      `<c r="B${row}"[^>]*t="s"[^>]*><v>(\\d+)</v>`,
    ).exec(body);
    if (index && payload) {
      cells.push({ index: Number(index[1]), string: Number(payload[1]) });
    }
  }
  cells.sort((left, right) => left.index - right.index);
  if (!cells.length) throw new Error("Резервная копия в книге пуста");
  if (cells.some((cell, order) => cell.index !== order + 1)) {
    throw new Error("Куски резервной копии в книге идут не подряд");
  }
  return cells.map((cell) => cell.string);
}

function setCell(sheetXml, reference, value) {
  const pattern = new RegExp(`(<c r="${reference}"[^>]*>)<v>[^<]*</v>`);
  if (!pattern.test(sheetXml))
    throw new Error(`В сводке нет ячейки ${reference}`);
  return sheetXml.replace(pattern, `$1<v>${value}</v>`);
}

/**
 * Объединить обходы в книге.
 *
 * @param {Buffer} buffer книга целиком
 * @param {(payload: any) => any} applyMerge правка разобранной копии
 * @returns {Promise<{data: Buffer, stats: any}>}
 */
export async function mergeWorkbookRounds(buffer, applyMerge) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPaths = await readSheetPaths(zip);
  const backupPath = sheetPaths.get(BACKUP_SHEET_NAME);
  if (!backupPath) throw new Error("В книге нет листа «Project Backup»");

  const backupSheet = await readText(zip, backupPath);
  const sharedPath = "xl/sharedStrings.xml";
  const shared = await readText(zip, sharedPath);
  const entries = [...shared.matchAll(/<si>(.*?)<\/si>/gs)].map(
    (match) => match[1],
  );
  const chunkCells = readChunkCells(backupSheet);
  const chunks = chunkCells.map((position) => {
    const text = /^<t(?: [^>]*)?>(.*)<\/t>$/s.exec(entries[position]);
    if (!text) throw new Error("Кусок резервной копии не на месте");
    return unescapeXml(text[1]);
  });

  const payload = JSON.parse(chunks.join(""));
  const stats = applyMerge(payload);

  // Кусков ровно столько же, сколько ячеек под них: строки листа не трогаются,
  // меняется только их содержимое. Последний кусок добирает остаток.
  const serialized = JSON.stringify(payload);
  const size = Math.ceil(serialized.length / chunkCells.length);
  chunkCells.forEach((position, order) => {
    const part =
      order === chunkCells.length - 1
        ? serialized.slice(order * size)
        : serialized.slice(order * size, (order + 1) * size);
    entries[position] = `<t xml:space="preserve">${escapeXml(part)}</t>`;
  });
  zip.file(
    sharedPath,
    `${shared.slice(0, shared.indexOf("<si>"))}${entries
      .map((entry) => `<si>${entry}</si>`)
      .join("")}</sst>`,
  );

  const monitoring = await findMonitoringRoundColumn(zip, sheetPaths);
  const monitoringSheet = await readText(zip, monitoring.path);
  let swapped = 0;
  zip.file(
    monitoring.path,
    monitoringSheet.replace(
      new RegExp(`(<c r="${monitoring.column}\\d+"[^>]*>)<v>([^<]*)</v>`, "g"),
      (cell, head, value) => {
        // У текстовой ячейки в `<v>` лежит не число, а номер общей строки, и
        // заголовок столбца так же легко совпал бы с номером обхода.
        if (/\st="/.test(head)) return cell;
        if (Number(value) !== stats.from) return cell;
        swapped += 1;
        return `${head}<v>${stats.into}</v>`;
      },
    ),
  );
  if (swapped !== stats.moved) {
    throw new Error(
      `На листе осмотров ${swapped} строк обхода №${stats.from}, в копии ${stats.moved}`,
    );
  }

  if (stats.roundChanged) {
    let summary = setCell(backupSheet, `D${SUMMARY_CURRENT_ROUND}`, stats.into);
    summary = setCell(summary, `D${SUMMARY_CHECKED}`, stats.checked);
    summary = setCell(
      summary,
      `D${SUMMARY_REMAINING}`,
      Math.max(0, stats.total - stats.checked),
    );
    zip.file(backupPath, summary);
  }

  return { data: await zip.generateAsync({ type: "nodebuffer" }), stats };
}
