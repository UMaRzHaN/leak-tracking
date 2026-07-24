import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { SYNONYMS } from "./synonyms";

// ─── normalizeStationName ─────────────────────────────────────────────────────
export function normalizeStationName(value) {
  if (typeof value !== "string") return value;

  let v = value.trim().toLowerCase();

  // 0️⃣ voice: cs / dcs → кс / дкс
  v = v.replace(
    /(^|\s)(cs|dcs)(?=\s|$)/gi,
    (_, pre, t) => `${pre}${t.toLowerCase() === "cs" ? "кс" : "дкс"}`,
  );

  // 1️⃣ КС / ДКС + номер + литера (без дефиса)
  v = v.replace(
    /(^|\s)(кс|дкс)\s*(\d+)\s*([а-яa-z]?)(?=\s|$)/gi,
    (_, pre, type, num, lit) =>
      `${pre}${type.toUpperCase()}-${num}${lit.toUpperCase()}`,
  );

  // 1️⃣.5 КС-5б / ДКС-12а (с дефисом)
  v = v.replace(
    /(^|\s)(кс|дкс)-(\d+)([а-яa-z]?)(?=\s|$)/gi,
    (_, pre, type, num, lit) =>
      `${pre}${type.toUpperCase()}-${num}${lit.toUpperCase()}`,
  );

  // 2️⃣ просто "кс" / "дкс"
  v = v.replace(
    /(^|\s)(кс|дкс)(?=\s|$)/gi,
    (_, pre, t) => `${pre}${t.toUpperCase()}`,
  );

  // 3️⃣ чистка пробелов
  v = v.replace(/\s+/g, " ").trim();

  // 4️⃣ капитализация остальных слов
  v = v
    .split(" ")
    .map((w) => {
      if (w === "КС" || w === "ДКС") return w;
      if (/^(КС|ДКС)-\d+[А-Я]?$/.test(w)) return w;
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return v;
}

// ─── normalizeBySynonyms utils ────────────────────────────────────────────────
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

// ─── normalizeBySynonyms ──────────────────────────────────────────────────────
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

  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);

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

  // 1️⃣ Первая буква каждого слова заглавная
  value = value
    .split(" ")
    .map((w) => {
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  // 2️⃣ Восстанавливаем оригинальный регистр канонических значений (от длинных к коротким)
  // После шага 1 слова уже с заглавной, поэтому ищем без учёта регистра
  const canonicals = Object.values(map)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const canon of canonicals) {
    const canonLc = canon.toLowerCase();
    const valueLc = value.toLowerCase();
    const idx = valueLc.indexOf(canonLc);
    if (idx !== -1) {
      value = value.slice(0, idx) + canon + value.slice(idx + canonLc.length);
      break;
    }
  }

  return {
    value,
    type: detectedType,
  };
}

// ─── normalizeVoiceResult ─────────────────────────────────────────────────────
export function normalizeVoiceResult(raw, PROJECT) {
  if (!raw) return {};

  const config = PROJECT_LOCATION_CONFIG[PROJECT];
  if (!config) return raw;

  const result = { ...raw };

  // 1️⃣ main → project.main (field)
  if (raw.main) {
    result[config.main] = raw.main;
    delete result.main;
  }

  // 2️⃣ field → project.field (station)
  if (raw.secondary) {
    result[config.secondary] = raw.secondary;
    delete result.secondary;
  }

  // 3️⃣ location → project.location (location)
  if (raw.last) {
    result[config.last] = raw.last;
    delete result.last;
  }

  return result;
}

// ─── normalizeSynonyms ────────────────────────────────────────────────────────
export function normalizeSynonyms(data, list) {
  const result = { ...data };

  list.forEach((field) => {
    if (!result[field]) return;

    const map = SYNONYMS[field];
    const value = result[field].toLowerCase();

    for (const [key, normalized] of Object.entries(map)) {
      if (value.includes(key)) {
        result[field] = normalized;
        break;
      }
    }
  });

  return result;
}
