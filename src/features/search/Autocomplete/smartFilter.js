/**
 * Умный поиск по словарю с поддержкой аббревиатур и параметров DN/PN.
 *
 * Примеры:
 *  "змс 100/160"   → Задвижка механическая стальная DN-100 PN-160…
 *  "сппк 25/64"    → СППК DN-25 PN-64…
 *  "кш 50/64"      → Кран шаровой DN-50 PN-64…
 *  "кзв 15/160"    → Клапан запорный (вентиль) DN-15 PN-160…
 *  "рк 150/64"     → Регулирующий клапан DN-150 PN-64…
 *  "DN-100 PN-160" → Задвижка механическая стальная DN-100 PN-160…
 */

/** Единый словарь аббревиатур — используется везде в этом файле */
const ABBREV_MAP = {
  // Задвижки
  змс: "задвижка механическая стальная",
  збс: "задвижка байпасная стальная",
  зд: "задвижка дисковая",
  зму: "задвижка муфтовая",

  // Краны
  кш: "кран шаровой",
  кп: "кран пробковый",
  ик: "игольчатый кран",

  // Клапаны
  ок: "обратный клапан",
  сппк: "сбросной пружинный предохранительный клапан",
  кзв: "клапан запорный",
  кз: "клапан запорный",
  рк: "регулирующий клапан",

  // Регуляторы / управление
  рд: "регулятор давления",
  рдг: "регулятор давления газа",
  эпуу: "электропневматическое управляющее устройство",

  // Оборудование / агрегаты
  авог: "аппарат воздушного охлаждения газа",
  авод: "аппарат воздушного охлаждения",
  бфс: "блок фильтрсепараторов",
  бптг: "блок подготовки топливного газа",
  гпа: "газоперекачивающий агрегат",
  тка: "турбокомпрессорный агрегат",
  пу: "пылеуловитель",
  пг: "печь газовая",

  // Объекты инфраструктуры
  кс: "компрессорная станция",
  нс: "насосная станция",
  дкс: "дожимная компрессорная станция",
  днс: "дожимная насосная станция",
  лкс: "линейная компрессорная станция",
  гпс: "газоперекачивающая станция",
  гкс: "газокомпрессорная станция",
  бкс: "бустерная компрессорная станция",
  нгду: "нефтегазодобывающее управление",
  гду: "газодобывающее управление",
  нду: "нефтедобывающее управление",
  пднг: "промысел добычи нефти и газа",
  гп: "газовый промысел",
  нп: "нефтяной промысел",
  сп: "скважинная площадка",
  укпг: "установка комплексной подготовки газа",
  укпн: "установка комплексной подготовки нефти",
  упсв: "установка предварительного сброса воды",
  упн: "установка подготовки нефти",
  гсп: "газосборный пункт",
  нсп: "нефтесборный пункт",
  цпс: "центральный пункт сбора",
  цпп: "центральный пункт подготовки",
  мг: "магистральный газопровод",
  лпдс: "линейная производственно-диспетчерская станция",
  грс: "газораспределительная станция",
  гис: "газоизмерительная станция",
  ууг: "узел учета газа",
  прг: "пункт редуцирования газа",
  грп: "газорегуляторный пункт",
  гру: "газорегуляторная установка",
  пхг: "подземное хранилище газа",
  рп: "резервуарный парк",
  снн: "станция налива нефти и нефтепродуктов",
  фх: "факельное хозяйство",
};

/** Нормализует строку для поиска */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[‑–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Извлекает числовые параметры DN/PN (или Ду/Ру) из строки */
function extractNumbers(query) {
  const n = normalize(query);
  const result = { dn: null, pn: null };

  // Формат XX/XX (например 100/160 или ЗМС 100/160)
  const slashMatch = n.match(/(\d{1,3})\/(\d{1,3})/);
  if (slashMatch) {
    result.dn = parseInt(slashMatch[1], 10);
    result.pn = parseInt(slashMatch[2], 10);
    return result;
  }

  // Явные префиксы DN/PN или Ду/Ру — не захватывают первое попавшееся число
  const dnExplicit = n.match(/(?:dn|ду)[- ]?(\d{1,3})/);
  const pnExplicit = n.match(/(?:pn|ру)[- ]?(\d{1,3})/);

  if (dnExplicit) result.dn = parseInt(dnExplicit[1], 10);
  if (pnExplicit) result.pn = parseInt(pnExplicit[1], 10);

  // Фолбэк: одиночное число без префикса (только для коротких запросов)
  if (!dnExplicit && !pnExplicit) {
    const bare = n.match(/(\d{1,3})/);
    if (bare) result.dn = parseInt(bare[1], 10);
  }

  return result;
}

/** Расширяет аббревиатуру до полного названия */

/**
 * Проверяет, содержит ли нормализованный текст опции указанную аббревиатуру
 * (как расширенную форму ИЛИ как сам токен — для случаев типа "СППК DN-20 PN-16").
 */
function optionMatchesAbbrev(normalizedOption, abbrev, expandedForm) {
  if (normalizedOption.includes(expandedForm)) return true;
  // Опция содержит аббревиатуру как отдельный токен в начале (напр. "сппк dn-20")
  const token = abbrev + " ";
  return (
    normalizedOption.startsWith(token) || normalizedOption.includes(" " + token)
  );
}

/** Вычисляет релевантность совпадения (0-100) */
function calculateRelevance(query, option) {
  const q = normalize(query);
  const o = normalize(option);

  if (o.includes(q)) return 100;

  const nums = extractNumbers(query);
  const hasNumbers = nums.dn !== null || nums.pn !== null;

  const queryWords = q.split(/[\s/\-_,]+/).filter(Boolean);
  const abbrevWord = queryWords.find(
    (w) => w.length <= 5 && /^[а-яёa-z]+$/.test(w) && ABBREV_MAP[w],
  );
  const hasAbbreviation = !!abbrevWord;

  if (hasAbbreviation && hasNumbers) {
    const expanded = ABBREV_MAP[abbrevWord];
    if (optionMatchesAbbrev(o, abbrevWord, expanded)) {
      const optionNums = extractNumbers(option);
      if (
        nums.dn &&
        nums.pn &&
        optionNums.dn === nums.dn &&
        optionNums.pn === nums.pn
      )
        return 100;
      if (nums.dn && optionNums.dn === nums.dn) return 95;
      if (nums.pn && optionNums.pn === nums.pn) return 90;
      return 20;
    }
  }

  if (hasNumbers && !hasAbbreviation) {
    const optionNums = extractNumbers(option);
    if (
      nums.dn &&
      nums.pn &&
      optionNums.dn === nums.dn &&
      optionNums.pn === nums.pn
    )
      return 100;
    let score = 0;
    if (nums.dn && optionNums.dn === nums.dn) score += 50;
    if (nums.pn && optionNums.pn === nums.pn) score += 50;
    if (score > 0) return score;
  }

  if (hasAbbreviation && !hasNumbers) {
    const expanded = ABBREV_MAP[abbrevWord];
    if (optionMatchesAbbrev(o, abbrevWord, expanded)) return 90;
  }

  let matchedWords = 0;
  for (const word of queryWords) {
    if (word.length >= 2 && o.includes(word)) matchedWords++;
  }
  if (queryWords.length > 0) {
    const wordScore = (matchedWords / queryWords.length) * 80;
    if (wordScore > 40) return Math.round(wordScore);
  }

  return 0;
}

/**
 * Фильтрует и ранжирует опции по строке поиска.
 * @param {string} query
 * @param {string[]} options
 * @param {number} minScore
 */
export function smartFilter(query, options, minScore = 60) {
  if (!query?.trim()) return options.slice(0, 20);

  const q = normalize(query);
  const nums = extractNumbers(query);
  const hasNumbers = nums.dn !== null || nums.pn !== null;

  // Ищем аббревиатуру в запросе (наиболее длинную — чтобы "рдг" побеждал "рд")
  let foundAbbrev = null;
  let expandedAbbrev = null;
  for (const abbr of Object.keys(ABBREV_MAP).sort(
    (a, b) => b.length - a.length,
  )) {
    if (q.includes(abbr)) {
      foundAbbrev = abbr;
      expandedAbbrev = ABBREV_MAP[abbr];
      break;
    }
  }

  if (foundAbbrev && hasNumbers) {
    const scored = options
      .map((option) => {
        const o = normalize(option);
        const optionNums = extractNumbers(option);
        const matches = optionMatchesAbbrev(o, foundAbbrev, expandedAbbrev);
        const dnMatch = nums.dn != null && optionNums.dn === nums.dn;
        const pnMatch = nums.pn != null && optionNums.pn === nums.pn;

        if (matches && dnMatch && pnMatch) return { option, score: 100 };
        if (matches && dnMatch) return { option, score: 95 };
        if (matches && pnMatch) return { option, score: 90 };
        if (matches) return { option, score: 15 };
        return { option, score: 0 };
      })
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return scored.map((item) => item.option);
  }

  const scored = options
    .map((option) => ({ option, score: calculateRelevance(query, option) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.option);
}

/**
 * Проверяет, является ли строка точным сокращением для опции.
 */
export function isAbbreviation(query, option) {
  return calculateRelevance(query, option) >= 90;
}
