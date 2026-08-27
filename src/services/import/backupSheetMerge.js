import { LEAK_PHOTO_FIELDS } from "@/utils/photoFields";
import { normalizeLeakTag } from "@/utils/leakIdentity";

/**
 * Правки, сделанные в Excel, поверх служебной копии проекта.
 *
 * Выгрузка кладёт в книгу два представления одних и тех же утечек: видимый
 * лист, который человек читает и правит, и служебный лист со слепком проекта —
 * историей, обходами, снимками, всем тем, чего в плоской таблице нет. Импорт
 * читал служебный лист и на этом останавливался, потому что он полнее. Пока
 * книгу возвращали нетронутой, это было верно; стоило поправить пару ячеек в
 * Excel — и правки исчезали молча, а приложение рапортовало об успешном
 * импорте.
 *
 * Поэтому слепок здесь — основа, а видимый лист — правки поверх неё. Берётся
 * только то, что человек действительно изменил: значение, совпадающее со
 * слепком, не трогает карточку, поэтому нетронутая книга проходит через
 * слияние без единого изменения.
 */

/*
 * Поля, которых видимый лист не касается.
 *
 * Снимки в таблице — ссылки на файлы в архиве, а в слепке лежат сами
 * изображения; взять ссылку вместо снимка значило бы потерять фотографию.
 * Остальное — служебное: идентификаторы, отметки времени и записи, которые
 * ведёт приложение, а не человек за таблицей.
 */
const IGNORED_KEYS = new Set([
  ...LEAK_PHOTO_FIELDS,
  "id",
  "index",
  "created_at",
  "createdAt",
  "updatedAt",
  "history",
  "monitoringRecords",
  "importedFromExcel",
  "importedAt",
]);

/** Поля, которые считаются сами и идут следом за своим источником. */
const DERIVED_KEYS = new Map([["priority", "leak_speed"]]);

function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function sameValue(left, right) {
  if (isBlank(left) && isBlank(right)) return true;
  if (isBlank(left) || isBlank(right)) return false;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber;
  }

  const leftText = canonical(left);
  const rightText = canonical(right);
  if (leftText === rightText) return true;

  // Одна и та же дата, записанная по-разному, — не правка: слепок держит её
  // строкой ISO, а лист отдаёт то, что вернул Excel.
  const leftTime = Date.parse(leftText);
  const rightTime = Date.parse(rightText);
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

/**
 * @param {Record<string, any>} base карточка из служебного листа
 * @param {Record<string, any>} row строка видимого листа
 * @returns {{leak: Record<string, any>, changed: string[]}}
 */
function applyRowEdits(base, row, { statusFromSheet = true } = {}) {
  const changed = [];
  const leak = { ...base };

  for (const [key, value] of Object.entries(row)) {
    if (IGNORED_KEYS.has(key) || DERIVED_KEYS.has(key)) continue;
    // Статуса в строке не было — его дописал `normalizeImportedLeak`, потому
    // что путь без слепка обязан отдать утечку со статусом. Здесь слепок
    // полнее: принять дописанное за правку значило бы откатить статус,
    // который человек в таблице не трогал. Так терялось «устранена» после
    // круга через Excel, если ячейку не удавалось прочитать.
    if (key === "status" && !statusFromSheet) continue;
    // Пустая ячейка — это «здесь ничего не написано», а не «сотри то, что
    // знает приложение»: в таблице нет всех полей карточки, и вычищать по ней
    // означало бы терять данные при каждом круге.
    if (isBlank(value)) continue;
    if (sameValue(base[key], value)) continue;
    leak[key] = value;
    changed.push(key);
  }

  for (const [derived, source] of DERIVED_KEYS) {
    if (changed.includes(source) && !isBlank(row[derived])) {
      leak[derived] = row[derived];
    }
  }

  return { leak, changed };
}

/**
 * Слепок проекта с наложенными правками из видимого листа.
 *
 * Строка, которой в слепке нет, — новая утечка: её дописали в Excel, и
 * потерять её так же обидно, как правку. Карточка, которой нет в таблице,
 * остаётся: строку могли удалить по ошибке или отфильтровать перед
 * сохранением, и импорт — не то место, где данные исчезают без спроса.
 *
 * @param {Record<string, any>[]} backupLeaks
 * @param {Record<string, any>[]} sheetLeaks
 * @returns {{leaks: Record<string, any>[], edited: number, added: number, missing: number}}
 */
export function mergeSheetEditsIntoBackup(
  backupLeaks,
  sheetLeaks,
  { statusFromSheet = null } = {},
) {
  const leaks = Array.isArray(backupLeaks) ? [...backupLeaks] : [];
  const rows = Array.isArray(sheetLeaks) ? sheetLeaks : [];
  if (rows.length === 0) {
    return { leaks, edited: 0, added: 0, missing: leaks.length };
  }

  const indexByTag = new Map();
  leaks.forEach((leak, index) => {
    const tag = normalizeLeakTag(leak?.leak_id);
    if (tag && !indexByTag.has(tag)) indexByTag.set(tag, index);
  });

  const seenTags = new Set();
  const added = [];
  let edited = 0;

  for (const row of rows) {
    const tag = normalizeLeakTag(row?.leak_id);
    const index = tag ? indexByTag.get(tag) : undefined;
    if (index === undefined) {
      added.push(row);
      continue;
    }

    seenTags.add(tag);
    const { leak, changed } = applyRowEdits(leaks[index], row, {
      // `null` — вызывающая сторона не знает, что дала таблица: тогда
      // поведение прежнее, статус считается пришедшим из листа.
      statusFromSheet: statusFromSheet == null || statusFromSheet.has(tag),
    });
    if (changed.length === 0) continue;
    leaks[index] = leak;
    edited += 1;
  }

  return {
    leaks: [...leaks, ...added],
    edited,
    added: added.length,
    missing: indexByTag.size - seenTags.size,
  };
}
