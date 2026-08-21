/**
 * Правки, сделанные в Excel, поверх служебной копии реестра.
 *
 * Ровно та же история, что была у утечек, и то же решение — см.
 * services/import/backupSheetMerge. Архив инвентаризации кладёт в книгу два
 * представления одних и тех же карточек: видимый лист, который человек читает
 * и правит, и служебный лист со слепком, где лежит всё, чего в плоской таблице
 * нет, — история осмотров и снимки. Импорт читал слепок и на этом
 * останавливался, потому что он полнее: поправленные в Excel ячейки исчезали
 * молча, а приложение рапортовало об успешном импорте.
 *
 * Слепок здесь основа, видимый лист — правки поверх. Берётся только то, что
 * человек действительно изменил, поэтому нетронутая книга проходит через
 * слияние, не тронув ни одной карточки.
 */

/*
 * Поля, которых видимый лист не касается.
 *
 * «Фото» в таблице — ссылка на файл в архиве, а в слепке лежит сам снимок;
 * взять ссылку вместо снимка значило бы потерять фотографию. Остальное
 * служебное: номер строки, идентификаторы и отметки времени ведёт приложение.
 * `component_uid` — то, по чему карточки сопоставляются, и правка номера в
 * таблице означает другую карточку, а не переименование этой.
 */
const IGNORED_KEYS = new Set([
  "photo",
  "id",
  "index",
  "component_uid",
  "history",
  "createdAt",
  "created_at",
  "updatedAt",
]);

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
  // числом или строкой, а лист отдаёт то, что вернул Excel.
  const leftTime = Date.parse(leftText);
  const rightTime = Date.parse(rightText);
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

function uidOf(card) {
  return String(card?.component_uid ?? "").trim();
}

/**
 * @param {Record<string, any>} base карточка из служебного листа
 * @param {Record<string, any>} row строка видимого листа
 */
function applyRowEdits(base, row) {
  const changed = [];
  const card = { ...base };

  for (const [key, value] of Object.entries(row)) {
    if (IGNORED_KEYS.has(key)) continue;
    // Пустая ячейка — «здесь ничего не написано», а не «сотри то, что знает
    // приложение»: в таблице нет всех полей карточки.
    if (isBlank(value)) continue;
    if (sameValue(base[key], value)) continue;
    card[key] = value;
    changed.push(key);
  }

  return { card, changed };
}

/**
 * Слепок реестра с наложенными правками из видимого листа.
 *
 * Строка, которой в слепке нет, — новая карточка: её дописали в Excel.
 * Карточка, которой нет в таблице, остаётся: строку могли отфильтровать перед
 * сохранением, и импорт — не то место, где данные исчезают без спроса.
 *
 * Отметка времени поднимается только у изменённых карточек. Иначе нетронутая
 * книга объявляла бы себя свежее всего, что человек успел записать в
 * приложении после выгрузки, и затирала бы это при слиянии.
 *
 * @param {Record<string, any>[]} backupCards карточки из служебного листа
 * @param {Record<string, any>[]} sheetCards строки видимого листа
 * @param {{now?: number}} [options]
 * @returns {{cards: Record<string, any>[], edited: number, added: number, missing: number}}
 */
export function mergeSheetEditsIntoCards(
  backupCards,
  sheetCards,
  options = {},
) {
  const { now = Date.now() } = options;
  const cards = Array.isArray(backupCards) ? [...backupCards] : [];
  const rows = Array.isArray(sheetCards) ? sheetCards : [];
  if (rows.length === 0) {
    return { cards, edited: 0, added: 0, missing: cards.length };
  }

  const indexByUid = new Map();
  cards.forEach((card, index) => {
    const uid = uidOf(card);
    if (uid && !indexByUid.has(uid)) indexByUid.set(uid, index);
  });

  const seenUids = new Set();
  const added = [];
  let edited = 0;

  for (const row of rows) {
    const uid = uidOf(row);
    const index = uid ? indexByUid.get(uid) : undefined;
    if (index === undefined) {
      if (uid) added.push(row);
      continue;
    }

    seenUids.add(uid);
    const { card, changed } = applyRowEdits(cards[index], row);
    if (changed.length === 0) continue;
    cards[index] = { ...card, updatedAt: now };
    edited += 1;
  }

  return {
    cards: [...cards, ...added],
    edited,
    added: added.length,
    missing: indexByUid.size - seenUids.size,
  };
}
