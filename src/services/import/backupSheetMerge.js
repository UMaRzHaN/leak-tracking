import { LEAK_PHOTO_FIELDS } from "@/utils/photoFields";
import { normalizeLeakTag } from "@/utils/leakIdentity";
import { toExcelDateValue } from "@/services/excelExport/cellValues";
import { getLeakSheetValue } from "@/services/excelExport/leakSheetValues";
import { formatDate, parseDateValue } from "./cellDates";

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
 * Поля, которых правка в таблице не касается.
 *
 * Снимки в таблице — ссылки на файлы в архиве, а в слепке лежат сами
 * изображения; взять ссылку вместо снимка значило бы потерять фотографию.
 * `index` — номер строки: его меняют перестановкой строк, а не как данные.
 *
 * Раньше список был длиннее и перечислял `id`, отметки времени, историю и
 * обходы. Не потому, что их нельзя править, а потому, что правки брались из
 * нормализованной утечки, куда `normalizeImportedLeak` дописывает всё это сам.
 * Список догонял побочные эффекты нормализатора — и не догнал `status`,
 * из-за чего утечка, устранённая в приложении, возвращалась из Excel
 * открытой. Теперь правки берутся из строки листа, и перечислять там нечего:
 * этих полей в ней просто нет.
 */
const IGNORED_KEYS = new Set([
  ...LEAK_PHOTO_FIELDS,
  "index",
  // Даты и время ремонта и устранения выводятся из ленты событий по статусу.
  // Поля записи с таким именем приложение не читает, так что правка в ячейке
  // ничего бы не изменила, а нетронутая книга оставляла в каждой починенной
  // утечке день без часов и строку «Sat Dec 30 1899 …» вместо времени.
  "repairAt",
  "repairTime",
  "resolvedAt",
  "resolvedTime",
]);

/** Поля, которые считаются сами и идут следом за своим источником. */
const DERIVED_KEYS = new Map([["priority", "leak_speed"]]);

/** Колонки календарного дня: в слепке и в книге день записан по-разному. */
const CALENDAR_KEYS = new Set(["date"]);

function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** День так, как его показала выгрузка и как его прочитал импорт. */
function calendarDay(value, { exported = false } = {}) {
  const date = exported
    ? toExcelDateValue(value)
    : parseDateValue(value, { calendarOnly: true });
  return date ? formatDate(date) : null;
}

/**
 * Числа сравниваются с допуском: процент уходит в книгу долей и
 * возвращается умноженным на сто, а 7 / 100 * 100 — это 7.000000000000001.
 */
function sameNumber(left, right) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-9 * scale;
}

function sameValue(left, right, key = "") {
  if (isBlank(left) && isBlank(right)) return true;
  if (isBlank(left) || isBlank(right)) return false;

  if (CALENDAR_KEYS.has(key)) {
    const leftDay = calendarDay(left, { exported: true });
    if (leftDay && leftDay === calendarDay(right)) return true;
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return sameNumber(leftNumber, rightNumber);
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
 * @param {Record<string, any>|null} vars переменные проекта из слепка
 * @returns {{leak: Record<string, any>, changed: string[]}}
 */
function applyRowEdits(base, row, vars) {
  const changed = [];
  const leak = { ...base };

  for (const [key, value] of Object.entries(row)) {
    if (IGNORED_KEYS.has(key) || DERIVED_KEYS.has(key)) continue;
    // Пустая ячейка — это «здесь ничего не написано», а не «сотри то, что
    // знает приложение»: в таблице нет всех полей карточки, и вычищать по ней
    // означало бы терять данные при каждом круге.
    if (isBlank(value)) continue;
    // Сравнивается с тем, что выгрузка показала для записи, а не с сырым
    // полем: округлённая величина расчёта или время, взятое из момента
    // создания, иначе сходили бы за правку.
    if (sameValue(getLeakSheetValue(key, base, vars), value, key)) continue;
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
  {
    sheetRows = /** @type {any[]|null} */ (null),
    vars = /** @type {Record<string, any>|null} */ (null),
  } = {},
) {
  const leaks = Array.isArray(backupLeaks) ? [...backupLeaks] : [];
  const rows = Array.isArray(sheetLeaks) ? sheetLeaks : [];
  if (rows.length === 0) {
    return { leaks, edited: 0, added: 0, missing: leaks.length };
  }

  // Очередь на бирку, а не одна запись: номер не уникален, и вторая строка с
  // тем же номером иначе ложилась на ту же карточку — настоящая утечка
  // получала дату, координаты и статус своего однофамильца.
  const indexesByTag = new Map();
  leaks.forEach((leak, index) => {
    const tag = normalizeLeakTag(leak?.leak_id);
    if (!tag) return;
    if (!indexesByTag.has(tag)) indexesByTag.set(tag, []);
    indexesByTag.get(tag).push(index);
  });

  const matchedTags = new Set();
  const added = [];
  let edited = 0;
  let missing = [...indexesByTag.values()].reduce(
    (total, indexes) => total + indexes.length,
    0,
  );

  for (const [rowIndex, row] of rows.entries()) {
    const tag = normalizeLeakTag(row?.leak_id);
    const index = tag ? indexesByTag.get(tag)?.shift() : undefined;
    if (index === undefined) {
      added.push(row);
      continue;
    }

    matchedTags.add(tag);
    missing -= 1;
    // Строка листа, если её дали. Без неё правки берутся из самой утечки —
    // так зовут этот модуль тесты и так он работал раньше.
    const edits = sheetRows?.[rowIndex] ?? row;
    const { leak, changed } = applyRowEdits(leaks[index], edits, vars);
    if (changed.length === 0) continue;
    leaks[index] = leak;
    edited += 1;
  }

  return {
    leaks: [...leaks, ...added],
    edited,
    added: added.length,
    missing,
  };
}
