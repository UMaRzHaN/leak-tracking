import { NUMBER_WORDS } from "./NUMBER_WORDS";
import { parseNumberFromWords } from "./parseNumberFromWords";

export function normalizeNumberWords(text) {
  if (!text) return text;

  let result = text.toLowerCase();

  /* ===== МИНУС ===== */
  result = result.replace(/минус\s+/g, "-");

  /* ===== РАЗМЕРЫ: "50 на 40", "пятьдесят на сорок" → "50/40" ===== */
  result = result.replace(
    /([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)\s+(на|дробь|x)\s+([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)(?=\s|$)/g,
    (match, a, _sep, b) => {
      const left =
        NUMBER_WORDS[a] !== undefined ? NUMBER_WORDS[a] : a;
      const right =
        NUMBER_WORDS[b] !== undefined ? NUMBER_WORDS[b] : b;

      if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right)))
        return match;

      return `${left}/${right}`;
    }
  );

  /* ===== ДЕСЯТИЧНЫЕ: "два и пять", "2 целых 3" ===== */
  result = result.replace(
    /([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)\s+(целых|и|точка)\s+([\wа-яёА-ЯЁ][\wа-яёА-ЯЁ-]*)(?=\s|$)/g,
    (match, intPart, _sep, fracPart) => {
      const a =
        NUMBER_WORDS[intPart] !== undefined
          ? NUMBER_WORDS[intPart]
          : intPart;
      const b =
        NUMBER_WORDS[fracPart] !== undefined
          ? NUMBER_WORDS[fracPart]
          : fracPart;

      if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b)))
        return match;

      return `${a}.${b}`;
    }
  );

  /* ===== СЛОВЕСНЫЕ ЧИСЛА ЛЮБОЙ ДЛИНЫ ===== */
  result = result.replace(
    /((ноль|один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|тысяча|тысячи|тысяч)(\s+|$))+/gi,
    (match) => {
      const num = parseNumberFromWords(match);
      return num !== null ? String(num) : match;
    }
  );

  return result;
}
