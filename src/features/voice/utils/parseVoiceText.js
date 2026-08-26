import { capitalizeFirst } from "@/utils/normalize/capitalizeFirst";
import {
  buildVoiceFieldMarkers,
  createVoiceIntegerRegex,
  createVoiceNumberRegex,
  createVoiceValueRegex,
} from "./matching";
import {
  expandVoiceFieldAbbreviations,
  normalizeEntityNumber,
  parseVoiceEntityDescriptor,
  normalizeRedundantStationAliases,
  normalizeStationName,
  normalizeVoiceRecognitionErrors,
} from "./normalization";
import { normalizeCapturedNumber, normalizeNumberWords } from "./numbers";
import { VOICE_FIELD_CONFIG } from "./synonyms";

const FIELD_MARKERS = buildVoiceFieldMarkers(VOICE_FIELD_CONFIG);

function formatCapturedText(value) {
  const text = value.trim();
  if (!text) return text;

  if (/^[a-z0-9\s\-/.(),]+$/i.test(text)) {
    return text
      .split(/\s+/)
      .map((word) => {
        if (!word || /^\d/.test(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  return capitalizeFirst(text);
}

function createPattern({ markers, type }) {
  if (type === "number") return createVoiceNumberRegex(markers);
  if (type === "integerString") return createVoiceIntegerRegex(markers);
  return createVoiceValueRegex(markers, FIELD_MARKERS);
}

const PATTERNS = Object.entries(VOICE_FIELD_CONFIG).map(([key, config]) => ({
  key,
  type: config.type,
  regex: createPattern(config),
}));

function formatValue(type, rawValue) {
  if (type === "number") {
    const value = normalizeCapturedNumber(rawValue);
    const number = Number(value);
    return value && !Number.isNaN(number) ? number : undefined;
  }

  if (type === "station") {
    const value = expandVoiceFieldAbbreviations(rawValue, {
      preserveStation: true,
    });
    return normalizeStationName(value);
  }
  if (type === "integerString") return rawValue.trim();
  if (type === "tag") {
    /*
     * Бирка со схемы — «ЗД32», «PG», «PT-101». Текст к этому месту уже
     * приведён к нижнему регистру, а обозначение с чертежа в нижнем регистре
     * не существует: одним словом его возвращают целиком заглавными.
     */
    const value = rawValue.trim();
    return /\s/.test(value) ? formatCapturedText(value) : value.toUpperCase();
  }
  if (type === "entity") {
    const { value } = parseVoiceEntityDescriptor(rawValue);
    return formatCapturedText(value);
  }

  const value = normalizeEntityNumber(expandVoiceFieldAbbreviations(rawValue));
  return formatCapturedText(value);
}

export const parseVoiceText = (text) => {
  if (!text) return {};

  const normalized = normalizeNumberWords(
    normalizeRedundantStationAliases(normalizeVoiceRecognitionErrors(text)),
  ).toLowerCase();
  const result = {};

  for (const { key, regex, type } of PATTERNS) {
    const matches = [...normalized.matchAll(regex)];
    const rawValue = matches[matches.length - 1]?.groups?.value;
    if (!rawValue) continue;

    const value = formatValue(type, rawValue);
    if (value !== undefined && value !== "") result[key] = value;
  }

  return result;
};
