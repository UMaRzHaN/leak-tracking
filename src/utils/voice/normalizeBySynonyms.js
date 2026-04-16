import { SYNONYMS } from "./synonyms";

/* ================= UTILS ================= */

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ================= NORMALIZER ================= */

export function normalizeBySynonyms(raw, field) {
  if (!raw) return { value: raw, type: null };

  const map = SYNONYMS?.[field];

  // если для поля нет словаря
  if (!map) {
    return {
      value: capitalize(raw),
      type: null,
    };
  }

  let value = raw.toLowerCase();

  const entries = Object.entries(map).sort(
    (a, b) => b[0].length - a[0].length
  );

  let detectedType = null;

  entries.forEach(([phrase, code]) => {
    if (!code) return;

    const safe = escapeRegExp(phrase);
    const re = new RegExp(`(^|\\s)${safe}(?=\\s|$)`, "gi");
    const codeLc = code.toLowerCase();

    // 🔒 если код уже есть в строке — не дублируем
    if (value.includes(codeLc)) return;

    if (re.test(value)) {
      if (!detectedType) {
        detectedType = code;
      }

      value = value.replace(re, `$1${codeLc}`);
    }
  });

  // чистка пробелов
  value = value.replace(/\s+/g, " ").trim();

  // финальная капитализация
  const ABBR = new Set(
    Object.values(map)
      .filter(Boolean)
      .map((v) => v.toLowerCase())
  );

  value = value
    .split(" ")
    .map((w) => {
      if (ABBR.has(w)) return w.toUpperCase();
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return {
    value,
    type: detectedType,
  };
}

/* ================= FALLBACK ================= */

function capitalize(str) {
  if (typeof str !== "string") return str;

  return str
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (/^\d/.test(w)) return w;
      if (w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
