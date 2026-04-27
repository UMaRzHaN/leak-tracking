/**
 * Утилита для умного поиска по словарю.
 * Поддерживает поиск по сокращениям: "ЗМС 100/160", "DN-100 PN-160", "100/160" и т.д.
 *
 * Примеры:
 * - "ЗМС 100/160" → "Задвижка механическая стальная DN-100 PN-160..."
 * - "DN-100 PN-160" → "Задвижка механическая стальная DN-100 PN-160..."
 * - "100/160" → найдёт все с DN-100 и PN-160
 * - "кран шар" → "Кран Шаровой/КШ"
 */

/** Нормализует строку для поиска: убирает лишнее, приводит к нижнему регистру */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[‑–—−]/g, "-") // нормализация тире
    .replace(/\s+/g, " ")
    .trim();
}

/** Извлекает числовые параметры из строки: DN, PN, DN-PN */
function extractNumbers(query) {
  const normalized = normalize(query);
  const result = { dn: null, pn: null };

  // Поиск DN-XX или DN-XX PN-XX или XX/XX в любом месте строки
  const dnMatch = normalized.match(/(?:dn[- ]?)?(\d{1,3})/);
  const pnMatch = normalized.match(/(?:pn[- ]?)?(\d{1,3})/);
  const slashMatch = normalized.match(/(\d{1,3})\/(\d{1,3})/);

  if (slashMatch) {
    // Формат: 100/160 или ЗМС 100/160
    result.dn = parseInt(slashMatch[1], 10);
    result.pn = parseInt(slashMatch[2], 10);
  } else {
    if (dnMatch) result.dn = parseInt(dnMatch[1], 10);
    if (pnMatch) result.pn = parseInt(pnMatch[1], 10);
  }

  return result;
}

/** Проверяет, содержит ли текст сокращение типа "ЗМС", "КШ", "КП" и т.д. */
function expandAbbreviation(abbrev) {
  const normalized = normalize(abbrev);
  const map = {
    "змс": "задвижка механическая стальная",
    "збс": "задвижка байпасная стальная",
    "зд": "задвижка дисковая",
    "зму": "задвижка муфтовая",
    "кс": "кран шаровой",
    "кш": "кран шаровой",
    "кп": "кран пробковый",
    "ок": "обратный клапан",
    "сппк": "сбросной пружинный предохранительный клапан",
    "рд": "регулятор давления",
    "эпуу": "электропневматическое управляющее устройство",
    "авод": "аппарат воздушного охлаждения",
    "авог": "аппарат воздушного охлаждения газа",
    "бфс": "блок фильтрсепараторов",
    "бптг": "блок подготовки топливного газа",
    "гпа": "газоперекачивающий агрегат",
    "тка": "турбокомпрессорный агрегат",
    "пу": "пылеуловитель",
    "пг": "печь газовая",
  };

  return map[normalized] || abbrev;
}

/** Вычисляет релевантность совпадения (0-100) */
function calculateRelevance(query, option) {
  const q = normalize(query);
  const o = normalize(option);

  // Прямое вхождение (максимальный приоритет)
  if (o.includes(q)) return 100;

  // Проверка: есть ли в query числа DN/PN?
  const nums = extractNumbers(query);
  const hasNumbers = nums.dn !== null || nums.pn !== null;

  // Проверка: есть ли сокращение в query? (ЗМС, КШ, СППК и т.д.)
  const queryWords = q.split(/[\s\/\-_,]+/).filter(Boolean);
  const abbrevWord = queryWords.find(w => w.length <= 5 && /^[а-яёa-z]+$/.test(w));
  const hasAbbreviation = abbrevWord && expandAbbreviation(abbrevWord) !== abbrevWord;

  // Если есть и сокращение, и числа - ищем строгое совпадение
  if (hasAbbreviation && hasNumbers) {
    const expanded = expandAbbreviation(abbrevWord);
    if (o.includes(expanded)) {
      // Проверяем совпадение чисел
      const optionNums = extractNumbers(option);
      if (nums.dn && nums.pn) {
        // Оба числа должны совпадать
        if (optionNums.dn === nums.dn && optionNums.pn === nums.pn) {
          return 100;
        }
      } else if (nums.dn && optionNums.dn === nums.dn) {
        return 95;
      } else if (nums.pn && optionNums.pn === nums.pn) {
        return 90;
      }
      // Есть сокращение, но числа не совпали - низкий приоритет
      return 20;
    }
  }

  // Только числа (без сокращения) - ищем по DN/PN
  if (hasNumbers && !hasAbbreviation) {
    const optionNums = extractNumbers(option);
    let score = 0;

    if (nums.dn && optionNums.dn === nums.dn) score += 50;
    if (nums.pn && optionNums.pn === nums.pn) score += 50;

    // Бонус за полное совпадение DN+PN
    if (nums.dn && nums.pn && optionNums.dn === nums.dn && optionNums.pn === nums.pn) {
      return 100;
    }

    if (score > 0) return score;
  }

  // Только сокращение (без чисел)
  if (hasAbbreviation && !hasNumbers) {
    const expanded = expandAbbreviation(abbrevWord);
    if (o.includes(expanded)) {
      return 90;
    }
  }

  // Разбиваем query на слова и проверяем каждое
  let matchedWords = 0;

  for (const word of queryWords) {
    if (word.length >= 2 && o.includes(word)) {
      matchedWords++;
    }
  }

  if (queryWords.length > 0) {
    const wordScore = (matchedWords / queryWords.length) * 80;
    if (wordScore > 40) return Math.round(wordScore);
  }

  return 0;
}

/**
 * Фильтрует опции по умному поиску.
 * @param {string} query - строка поиска
 * @param {string[]} options - массив опций для фильтрации
 * @param {number} minScore - минимальный балл релевантности (по умолчанию 60)
 * @returns {string[]} отфильтрованные и отсортированные по релевантности опции
 */
export function smartFilter(query, options, minScore = 60) {
  if (!query || !query.trim()) {
    return options.slice(0, 20);
  }

  const q = normalize(query);
  const nums = extractNumbers(query);

  // Проверяем есть ли числа в запросе
  const hasNumbers = nums.dn !== null || nums.pn !== null;

  // Проверяем есть ли сокращение (ЗМС, КШ, СППК и т.д.)
  const abbrevMap = {
    "змс": "задвижка механическая стальная",
    "збс": "задвижка байпасная стальная",
    "зд": "задвижка дисковая",
    "зму": "задвижка муфтовая",
    "кс": "кран шаровой",
    "кш": "кран шаровой",
    "кп": "кран пробковый",
    "ок": "обратный клапан",
    "сппк": "сбросной пружинный предохранительный клапан",
    "рд": "регулятор давления",
    "эпуу": "электропневматическое управляющее устройство",
  };

  let foundAbbrev = null;
  let expandedAbbrev = null;

  for (const [abbr, full] of Object.entries(abbrevMap)) {
    if (q.includes(abbr)) {
      foundAbbrev = abbr;
      expandedAbbrev = full;
      break;
    }
  }

  // Если есть И сокращение, И числа - требуем строгого совпадения
  if (foundAbbrev && hasNumbers) {
    const scored = options
      .map((option) => {
        const o = normalize(option);
        const optionNums = extractNumbers(option);

        // Проверяем: есть ли сокращение в option?
        const hasExpanded = o.includes(expandedAbbrev);
        // Проверяем совпадение чисел
        const dnMatch = nums.dn && optionNums.dn === nums.dn;
        const pnMatch = nums.pn && optionNums.pn === nums.pn;

        if (hasExpanded && dnMatch && pnMatch) return { option, score: 100 };
        if (hasExpanded && dnMatch) return { option, score: 95 };
        if (hasExpanded && pnMatch) return { option, score: 90 };
        // Есть сокращение, но числа не совпали - низкий приоритет
        if (hasExpanded) return { option, score: 15 };

        return { option, score: 0 };
      })
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return scored.map((item) => item.option);
  }

  // Обычный поиск без строгих требований
  const scored = options
    .map((option) => ({
      option,
      score: calculateRelevance(query, option),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.option);
}

/**
 * Проверяет, является ли строка точным сокращением для опции.
 * @param {string} query - строка поиска
 * @param {string} option - опция для проверки
 * @returns {boolean} true если query является сокращением option
 */
export function isAbbreviation(query, option) {
  const score = calculateRelevance(query, option);
  return score >= 90;
}