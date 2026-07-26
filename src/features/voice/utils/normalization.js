import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { ABBREV_MAP } from "@/utils/abbreviations";
import { SYNONYMS } from "./synonyms";

// ─── normalizeStationName ─────────────────────────────────────────────────────
export function normalizeStationName(value) {
  if (typeof value !== "string") return value;

  let v = value.trim().toLowerCase();

  // 0️⃣ voice: cs / dcs → кс / дкс
  v = v.replace(
    /(^|\s)(cs|dcs)(?=\s|[-‐‒–—−]|$)/gi,
    (_, pre, t) => `${pre}${t.toLowerCase() === "cs" ? "кс" : "дкс"}`,
  );

  // 1️⃣ КС / ДКС + optional "номер/№" + номер + литера
  v = v.replace(
    /(^|\s)(кс|дкс)\s*(?:(?:номер|number|no\.?|№)\s*)?(\d+)\s*([а-яa-z]?)(?=\s|$)/giu,
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

  // 3️⃣ universal entity number notation
  v = normalizeEntityNumber(v);

  // 3️⃣.5 clean spaces
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

const ABBREVIATION_ENTRIES = Object.entries(ABBREV_MAP).sort(
  ([left], [right]) => right.length - left.length,
);

const VOICE_ENTITY_ALIASES = {
  "кран шаровой": [
    "кран шаровой",
    "шаровой кран",
    "кран шаровый",
    "шаровый кран",
    "кран шоровой",
    "шоровой кран",
    "кран шаровои",
    "шаровои кран",
  ],
  "кран пробковый": ["кран пробковый", "пробковый кран", "клапан пробковый"],
  "игольчатый кран": [
    "игольчатый кран",
    "кран игольчатый",
    "клапан игольчатый",
  ],
  "обратный клапан": ["обратный клапан", "клапан обратный", "кран обратный"],
  "сбросной пружинный предохранительный клапан": [
    "сбросной пружинный предохранительный клапан",
    "пружинный предохранительный клапан",
    "предохранительный клапан",
    "клапан предохранительный",
    "сппк",
  ],
  "задвижка механическая стальная": [
    "задвижка механическая стальная",
    "механическая стальная задвижка",
    "стальная механическая задвижка",
    "задвижка стальная",
    "змс",
  ],
};

function normalizeAliasText(value) {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVoiceEntityAliasEntries() {
  const aliases = new Map();

  const add = (alias, canonical) => {
    const normalizedAlias = normalizeAliasText(alias);
    let normalizedCanonical = normalizeAliasText(canonical);
    normalizedCanonical = normalizeAliasText(
      ABBREV_MAP[normalizedCanonical] ?? normalizedCanonical,
    );
    if (!normalizedAlias || !normalizedCanonical) return;
    aliases.set(normalizedAlias, normalizedCanonical);
  };

  for (const [abbreviation, canonical] of Object.entries(ABBREV_MAP)) {
    add(abbreviation, canonical);
    add(canonical, canonical);
  }

  for (const [alias, canonical] of Object.entries(SYNONYMS.component ?? {})) {
    add(alias, canonical);
    add(canonical, canonical);
  }

  for (const [canonical, variants] of Object.entries(VOICE_ENTITY_ALIASES)) {
    add(canonical, canonical);
    for (const variant of variants) add(variant, canonical);
  }

  return [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);
}

const VOICE_ENTITY_ALIAS_ENTRIES = buildVoiceEntityAliasEntries();
const VOICE_ENTITY_ALIAS_MAP = new Map(VOICE_ENTITY_ALIAS_ENTRIES);
const VOICE_ENTITY_CANONICALS = [
  ...new Set(VOICE_ENTITY_ALIAS_ENTRIES.map(([, canonical]) => canonical)),
].sort((a, b) => b.length - a.length);

export function normalizeVoiceEntityName(text) {
  if (typeof text !== "string") return text;

  const value = normalizeAliasText(text);
  if (!value) return value;

  const exact = VOICE_ENTITY_ALIAS_MAP.get(value);
  if (exact) return exact;

  for (const canonical of VOICE_ENTITY_CANONICALS) {
    const words = canonical.split(/\s+/).map(escapeRegExp).join("\\s+");
    const repeated = new RegExp(`^(?:${words})(?:\\s+(?:${words}))+$`, "iu");
    if (repeated.test(value)) return canonical;
  }

  return value;
}

const STATION_ABBREVIATIONS = new Set([
  "кс",
  "cs",
  "дкс",
  "dcs",
  "лкс",
  "lcs",
  "нс",
  "ps",
  "днс",
  "bps",
  "грс",
  "gds",
  "гис",
  "gms",
]);

function replaceStandalone(text, search, replacement) {
  const safe = escapeRegExp(search);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${safe}(?=$|[^\\p{L}\\p{N}_])`,
    "giu",
  );

  return text.replace(pattern, (_, prefix) => `${prefix}${replacement}`);
}

function collapseRepeatedPhrase(text, phrase) {
  const words = phrase.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  const repeated = new RegExp(`(${words})(?:\\s+\\1)+`, "giu");
  return text.replace(repeated, "$1");
}

/**
 * Expands abbreviations inside an already captured field value.
 * This must run after field extraction, so facility markers such as КС-12 are
 * not destroyed before the station parser sees them.
 */
export function expandVoiceFieldAbbreviations(
  text,
  { preserveStation = false } = {},
) {
  if (typeof text !== "string") return text;

  let result = text;

  for (const [abbreviation, expanded] of ABBREVIATION_ENTRIES) {
    if (
      preserveStation &&
      STATION_ABBREVIATIONS.has(abbreviation.toLowerCase())
    ) {
      continue;
    }

    result = replaceStandalone(result, abbreviation, expanded);
    result = collapseRepeatedPhrase(result, expanded);
  }

  return result.replace(/\s+/g, " ").trim();
}

/**
 * Backward-compatible public helper. It is no longer used on the complete
 * utterance by parseVoiceText; callers should prefer expandVoiceFieldAbbreviations.
 */
export function expandVoiceAbbreviations(text) {
  if (typeof text !== "string") return text;

  const protectedValues = [];
  const protectedText = text.replace(
    /(^|[^\p{L}\p{N}_])(кс|cs|дкс|dcs|лкс|lcs|нс|ps|днс|bps|грс|gds|гис|gms)(\s*(?:[-‐‒–—−]\s*)?(?:(?:номер|number|no\.?|№)\s*)?\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}_])/giu,
    (_, prefix, abbreviation, suffix) => {
      const token = `__VOICE_STATION_${protectedValues.length}__`;
      protectedValues.push(`${abbreviation}${suffix}`);
      return `${prefix}${token}`;
    },
  );

  let result = expandVoiceFieldAbbreviations(protectedText);
  protectedValues.forEach((value, index) => {
    result = result.replace(`__VOICE_STATION_${index}__`, value);
  });

  return result;
}

/**
 * Collapses redundant station aliases before marker matching, e.g.
 * "КС компрессорная станция номер два" and the reverse order.
 */
export function normalizeRedundantStationAliases(text) {
  if (typeof text !== "string") return text;

  const pairs = [
    ["кс", "компрессорная станция"],
    ["cs", "compressor station"],
    ["дкс", "дожимная компрессорная станция"],
    ["dcs", "booster compressor station"],
  ];

  let result = text;
  for (const [abbr, phrase] of pairs) {
    const a = escapeRegExp(abbr);
    const p = phrase.split(/\s+/).map(escapeRegExp).join("\\s+");
    result = result
      .replace(
        new RegExp(`(^|\\s)${a}\\s+${p}(?=\\s|$)`, "giu"),
        `$1станция ${abbr}`,
      )
      .replace(
        new RegExp(`(^|\\s)${p}\\s+${a}(?=\\s|$)`, "giu"),
        `$1станция ${abbr}`,
      );
  }

  return result.replace(/\s+/g, " ").trim();
}

export function normalizeEntityNumber(text) {
  if (typeof text !== "string") return text;

  return text
    .replace(
      /(^|[^\p{L}\p{N}_])(?:номер|number|no\.?|№)\s*(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}_])/giu,
      "$1№$2",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a captured equipment/component value without confusing its explicit
 * entity number with a following size. The returned `value` remains compatible
 * with the existing string fields, while the structured parts can be reused by
 * future form fields.
 *
 * Example: "кш номер двадцать три пятьдесят на двадцать" is normalized before
 * this function to "кш номер 23 50/20" and becomes:
 * { name: "кран шаровой", number: "23", size: "50/20", value: "кран шаровой №23 50/20" }.
 */
export function parseVoiceEntityDescriptor(text) {
  if (typeof text !== "string") {
    return { name: text, number: null, size: null, value: text };
  }

  let value = normalizeEntityNumber(expandVoiceFieldAbbreviations(text));

  const numberMatch = value.match(
    /(^|[^\p{L}\p{N}_])№(\d+[а-яa-z]?)(?=$|[^\p{L}\p{N}_])/iu,
  );
  const sizeMatch = value.match(
    /(^|[^\p{L}\p{N}_])(\d+(?:[.,]\d+)?)\s*([/xх×])\s*(\d+(?:[.,]\d+)?)(?=$|[^\p{L}\p{N}_])/iu,
  );

  const number = numberMatch?.[2] ?? null;
  const size = sizeMatch ? `${sizeMatch[2]}/${sizeMatch[4]}` : null;

  let name = value;
  if (numberMatch) name = name.replace(numberMatch[0], numberMatch[1]);
  if (sizeMatch) name = name.replace(sizeMatch[0], sizeMatch[1]);
  name = normalizeVoiceEntityName(name);

  value = [name, number ? `№${number}` : null, size].filter(Boolean).join(" ");

  return { name, number, size, value };
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

// Canonicalizes common speech-recognition mistakes before field matching.
export function normalizeVoiceRecognitionErrors(text) {
  if (typeof text !== "string") return text;

  return text
    .replace(
      /(^|\s)место\s+рождени(?:е|я)(?:\s+газа)?(?=\s|$)/giu,
      "$1месторождение",
    )
    .replace(/\s+/g, " ")
    .trim();
}
