// ─── NUMBER_WORDS ───────────────────────────────────────────────────────────
export const NUMBER_WORDS = {
  // 0–9
  ноль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,

  // 10–19
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,

  // десятки
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,

  // сотни
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,

  // тысячи (на будущее)
  тысяча: 1000,
  тысячи: 1000,
  тысяч: 1000,
};

// ─── toNumber ────────────────────────────────────────────────────────────────
export const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") return v;

  const normalized = String(v).replace(",", ".");
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
};

// ─── parseNumberFromWords ─────────────────────────────────────────────────────
export const parseNumberFromWords = (text) => {
  if (!text) return null;

  const words = text.toLowerCase().replace(/[,]/g, " ").split(/\s+/);

  let total = 0;
  let current = 0;
  let fraction = 0;
  let fractionDivider = 1;
  let isFraction = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // дробная часть
    if (w === "и" || w === "целых") {
      continue;
    }

    if (w === "десятых") {
      fractionDivider = 10;
      isFraction = true;
      continue;
    }

    if (w === "сотых") {
      fractionDivider = 100;
      isFraction = true;
      continue;
    }

    const value = NUMBER_WORDS[w];

    if (value === undefined) continue;

    if (value === 1000) {
      total += (current || 1) * value;
      current = 0;
      continue;
    }

    if (value >= 100) {
      current += value;
      continue;
    }

    if (isFraction) {
      fraction += value;
    } else {
      current += value;
    }
  }

  total += current;

  if (isFraction) {
    total += fraction / fractionDivider;
  }

  const foundAny = words.some((w) => NUMBER_WORDS[w] !== undefined);
  return foundAny ? total : null;
};

// ─── normalizeNumberWords ─────────────────────────────────────────────────────
export function normalizeNumberWords(text) {
  if (!text) return text;

  let result = text.toLowerCase();

  /* ===== МИНУС ===== */
  result = result.replace(/минус\s+/g, "-");

  /* ===== РАЗМЕРЫ: "50 на 40", "пятьдесят на сорок" → "50/40" ===== */
  result = result.replace(
    /([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)\s+(на|дробь|x)\s+([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)(?=\s|$)/g,
    (match, a, _sep, b) => {
      const left = NUMBER_WORDS[a] !== undefined ? NUMBER_WORDS[a] : a;
      const right = NUMBER_WORDS[b] !== undefined ? NUMBER_WORDS[b] : b;

      if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right)))
        return match;

      return `${left}/${right}`;
    },
  );

  /* ===== ДЕСЯТИЧНЫЕ: "два и пять", "2 целых 3" ===== */
  result = result.replace(
    /([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)\s+(целых|и|точка)\s+([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)(?=\s|$)/g,
    (match, intPart, _sep, fracPart) => {
      const a =
        NUMBER_WORDS[intPart] !== undefined ? NUMBER_WORDS[intPart] : intPart;
      const b =
        NUMBER_WORDS[fracPart] !== undefined
          ? NUMBER_WORDS[fracPart]
          : fracPart;

      if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b)))
        return match;

      return `${a}.${b}`;
    },
  );

  /* ===== СЛОВЕСНЫЕ ЧИСЛА ЛЮБОЙ ДЛИНЫ ===== */
  result = result.replace(
    /((ноль|один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|тысяча|тысячи|тысяч)(\s+|$))+/gi,
    (match) => {
      const num = parseNumberFromWords(match);
      return num !== null ? String(num) : match;
    },
  );

  return result;
}
