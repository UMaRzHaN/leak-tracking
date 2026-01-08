import { SYNONYMS } from "./synonyms";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeEquipment(raw) {
  if (!raw) return raw;

  let value = raw.toLowerCase();

  const map = SYNONYMS.component;

  // 1️⃣ длинные фразы — первыми
  const entries = Object.entries(map).sort(
    (a, b) => b[0].length - a[0].length
  );

  let detectedType = null;

  entries.forEach(([phrase, code]) => {
    const safe = escapeRegExp(phrase);
    const re = new RegExp(`(^|\\s)${safe}(?=\\s|$)`, "g");

    if (re.test(value)) {
      detectedType = code;
      value = value.replace(re, `$1${code.toLowerCase()}`);
    }
  });

  // 2️⃣ чистка пробелов
  value = value.replace(/\s+/g, " ").trim();

  // 3️⃣ финальная капитализация
  value = value
    .split(" ")
    .map((w) => {
      if (["кш", "кп", "ок", "эпуу", "авог", "змс"].includes(w))
        return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return {
    value,
    type: detectedType,
  };
}
