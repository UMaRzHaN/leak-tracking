import { capitalizeFirst } from "@/utils/normalize/capitalizeFirst";
import {
  buildVoiceFieldMarkers,
  createVoiceIntegerRegex,
  createVoiceNumberRegex,
  createVoiceValueRegex,
} from "./matching";
import {
  expandVoiceAbbreviations,
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

  if (type === "station") return normalizeStationName(rawValue);
  if (type === "integerString") return rawValue.trim();
  return formatCapturedText(rawValue);
}

export const parseVoiceText = (text) => {
  if (!text) return {};

  const normalized = normalizeNumberWords(
    expandVoiceAbbreviations(normalizeVoiceRecognitionErrors(text)),
  ).toLowerCase();
  const result = {};

  for (const { key, regex, type } of PATTERNS) {
    const matches = [...normalized.matchAll(regex)];
    const rawValue = matches.at(-1)?.groups?.value;
    if (!rawValue) continue;

    const value = formatValue(type, rawValue);
    if (value !== undefined && value !== "") result[key] = value;
  }

  return result;
};
