import { NUMBER_WORDS } from "./numberWords";

export function normalizeNumberWords(text) {
  if (!text) return text;

  let result = text.toLowerCase();

  /* ===== минус ===== */
  result = result.replace(/\bминус\s+/g, "-");

  /* ===== РАЗМЕРЫ: "50 на 40" И "50 дробь 40" → "50/40" ===== */
  result = result.replace(
    /\b(\w+|\d+)\s+(на|дробь)\s+(\w+|\d+)\b/g,
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

  /* ===== ДЕСЯТИЧНЫЕ (БЕЗ слова "дробь") ===== */
  result = result.replace(
    /\b(\w+|\d+)\s+(целых|и|точка)\s+(\w+|\d+)\b/g,
    (match, intPart, _sep, fracPart) => {
      const a =
        NUMBER_WORDS[intPart] !== undefined ? NUMBER_WORDS[intPart] : intPart;
      const b =
        NUMBER_WORDS[fracPart] !== undefined ? NUMBER_WORDS[fracPart] : fracPart;

      if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b)))
        return match;

      return `${a}.${b}`;
    }
  );

  /* ===== одиночные числа ===== */
  Object.entries(NUMBER_WORDS).forEach(([word, num]) => {
    const re = new RegExp(`\\b${word}\\b`, "g");
    result = result.replace(re, String(num));
  });

  return result;
}
