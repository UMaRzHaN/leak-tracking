/**
 * Smart autocomplete filtering with support for:
 * - abbreviations
 * - DN/PN matching
 * - option objects with separate label/value/keywords
 */

const ABBREV_MAP = {
  sgv: "задвижка механическая стальная",
  bfv: "задвижка дисковая",
  tgv: "задвижка муфтовая",

  bv: "кран шаровой",
  pv: "кран пробковый",
  nv: "игольчатый кран",

  cv: "обратный клапан",
  srv: "сбросной пружинный предохранительный клапан",
  kz: "клапан запорный",
  rk: "регулирующий клапан",

  pr: "регулятор давления",
  gpr: "регулятор давления газа",
  epu: "электропневматическое управляющее устройство",

  acgu: "аппарат воздушного охлаждения газа",
  acu: "аппарат воздушного охлаждения",
  fsb: "блок фильтрсепараторов",
  fgcu: "блок подготовки топливного газа",
  gpu: "газоперекачивающий агрегат",
  tcu: "турбокомпрессорный агрегат",
  dc: "пылеуловитель",
  gh: "печь газовая",

  cs: "компрессорная станция",
  ps: "насосная станция",
  bcs: "дожимная компрессорная станция",
  bps: "дожимная насосная станция",
  lcs: "линейная компрессорная станция",
  ogpa: "нефтегазодобывающее управление",
  gpa: "газодобывающее управление",
  opa: "нефтедобывающее управление",
  gtf: "установка комплексной подготовки газа",
  fwko: "установка предварительного сброса воды",
  otf: "установка подготовки нефти",
  ggs: "газосборный пункт",
  ogs: "нефтесборный пункт",
  mgp: "магистральный газопровод",
  gds: "газораспределительная станция",
  gms: "газоизмерительная станция",
  gprs: "пункт редуцирования газа",
  ugs: "подземное хранилище газа",
  fs: "факельное хозяйство",

  змс: "задвижка механическая стальная",
  зд: "задвижка дисковая",
  зму: "задвижка муфтовая",
  кш: "кран шаровой",
  кп: "кран пробковый",
  ик: "игольчатый кран",
  ок: "обратный клапан",
  сппк: "сбросной пружинный предохранительный клапан",
  кз: "клапан запорный",
  рк: "регулирующий клапан",
  рд: "регулятор давления",
  рдг: "регулятор давления газа",
  эпуу: "электропневматическое управляющее устройство",
  авог: "аппарат воздушного охлаждения газа",
  авод: "аппарат воздушного охлаждения",
  бфс: "блок фильтрсепараторов",
  бптг: "блок подготовки топливного газа",
  гпа: "газоперекачивающий агрегат",
  тка: "турбокомпрессорный агрегат",
  пу: "пылеуловитель",
  пг: "печь газовая",
  кс: "компрессорная станция",
  нс: "насосная станция",
  дкс: "дожимная компрессорная станция",
  днс: "дожимная насосная станция",
  лкс: "линейная компрессорная станция",
  нгду: "нефтегазодобывающее управление",
  гду: "газодобывающее управление",
  нду: "нефтедобывающее управление",
  укпг: "установка комплексной подготовки газа",
  упсв: "установка предварительного сброса воды",
  упн: "установка подготовки нефти",
  гсп: "газосборный пункт",
  мг: "магистральный газопровод",
  грс: "газораспределительная станция",
  гис: "газоизмерительная станция",
  прг: "пункт редуцирования газа",
  пхг: "подземное хранилище газа",
  фх: "факельное хозяйство",
};

function optionValue(option) {
  return typeof option === "string" ? option : (option?.value ?? "");
}

function optionLabel(option) {
  return typeof option === "string"
    ? option
    : (option?.label ?? option?.value ?? "");
}

function optionKeywords(option) {
  return typeof option === "string" ? [] : (option?.keywords ?? []);
}

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[‐–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumbers(query) {
  const n = normalize(query);
  const result = { dn: null, pn: null };

  const slashMatch = n.match(/(\d{1,3})\/(\d{1,3})/);
  if (slashMatch) {
    result.dn = parseInt(slashMatch[1], 10);
    result.pn = parseInt(slashMatch[2], 10);
    return result;
  }

  const dnExplicit = n.match(/(?:dn|ду)[- ]?(\d{1,3})/);
  const pnExplicit = n.match(/(?:pn|ру)[- ]?(\d{1,3})/);

  if (dnExplicit) result.dn = parseInt(dnExplicit[1], 10);
  if (pnExplicit) result.pn = parseInt(pnExplicit[1], 10);

  if (!dnExplicit && !pnExplicit) {
    const bare = n.match(/(\d{1,3})/);
    if (bare) result.dn = parseInt(bare[1], 10);
  }

  return result;
}

function optionMatchesAbbrev(normalizedOption, abbrev, expandedForm) {
  if (normalizedOption.includes(expandedForm)) return true;
  const token = abbrev + " ";
  return (
    normalizedOption.startsWith(token) || normalizedOption.includes(" " + token)
  );
}

function calculateRelevance(query, option) {
  const q = normalize(query);
  const o = normalize(option);

  if (o.includes(q)) return 100;

  const nums = extractNumbers(query);
  const hasNumbers = nums.dn !== null || nums.pn !== null;

  const queryWords = q.split(/[\s/\-_,]+/).filter(Boolean);
  const abbrevWord = queryWords.find(
    (w) => w.length <= 6 && /^[а-яёa-z]+$/.test(w) && ABBREV_MAP[w],
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
      ) {
        return 100;
      }
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
    ) {
      return 100;
    }

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

function scoreOption(query, option) {
  const candidates = [
    optionLabel(option),
    optionValue(option),
    ...optionKeywords(option),
  ].filter(Boolean);

  return candidates.reduce(
    (best, candidate) => Math.max(best, calculateRelevance(query, candidate)),
    0,
  );
}

export function smartFilter(query, options, minScore = 60) {
  if (!query?.trim()) return options.slice(0, 20);

  const q = normalize(query);
  const nums = extractNumbers(query);
  const hasNumbers = nums.dn !== null || nums.pn !== null;

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
        const optionText = [
          optionLabel(option),
          optionValue(option),
          ...optionKeywords(option),
        ]
          .filter(Boolean)
          .join(" ");
        const o = normalize(optionText);
        const optionNums = extractNumbers(optionValue(option));
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
    .map((option) => ({ option, score: scoreOption(query, option) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.option);
}

export function isAbbreviation(query, option) {
  return scoreOption(query, option) >= 90;
}
