import {
  normalizeBySynonyms,
  normalizeVoiceResult,
  normalizeSynonyms,
  parseVoiceEntityDescriptor,
} from "./normalization";
import { parseVoiceText } from "./parseVoiceText";
import { fuzzyMatchOption } from "./matching";
import { objects, components } from "@/data/leak/fieldDictionary";

const normalizeComponentDisplayCase = (value) => {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  return words
    .map((word, index) => {
      // Keep technical abbreviations such as СППК, DN50 and PN16 intact.
      if (/^[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9./-]*$/u.test(word) && word.length > 1) {
        return word;
      }

      const lower = word.toLocaleLowerCase("ru-RU");
      return index === 0
        ? lower.charAt(0).toLocaleUpperCase("ru-RU") + lower.slice(1)
        : lower;
    })
    .join(" ");
};

/**
 * Full voice text processing pipeline.
 *
 * @param {string[]} arr          — synonym fields from project config
 * @param {string}   text         — raw recognized text
 * @param {Function} setVoiceData — state setter that receives parsed result
 * @param {string}   project      — project type ("upstream"|"midstream"|"downstream")
 * @param {string|null} dictationKey — key of textarea field in current step (for dictation mode)
 */
export const handleVoiceText = (
  arr,
  text,
  setVoiceData,
  project,
  dictationKey = null,
  allowedFields = [],
) => {
  const parsed = parseVoiceText(text);
  const normalizedData = normalizeSynonyms(
    normalizeVoiceResult(parsed, project),
    arr,
  );
  const allowed = new Set(allowedFields);
  const data =
    allowed.size > 0
      ? Object.fromEntries(
          Object.entries(normalizedData).filter(([key]) => allowed.has(key)),
        )
      : normalizedData;

  // Dictation mode: no structured fields recognized → put raw text into textarea field
  if (dictationKey && Object.keys(data).length === 0) {
    setVoiceData({ [dictationKey]: text });
    return;
  }

  // Synonym normalization
  const SYNONYM_FIELDS = [
    ["actuator_type", "actuator_type"],
    ["connection_type", "connection_type"],
    ["installation_type", "installation_type"],
    ["leak_cause", "leak_cause"],
    ["leak_description", "leak_description"],
    ["materials_equipment", "component"],
  ];

  for (const [field, synonymKey] of SYNONYM_FIELDS) {
    if (data[field])
      data[field] = normalizeBySynonyms(data[field], synonymKey).value;
  }

  // Fuzzy match object against objects dictionary
  if (data.object) {
    const synonymed = normalizeBySynonyms(data.object, "component").value;
    const fuzzy = fuzzyMatchOption(data.object, objects);
    data.object = fuzzy ?? synonymed;
  }

  // Fuzzy-match only the component name. Preserve an explicitly spoken
  // entity number and size instead of replacing the whole descriptor with
  // the dictionary option (for example, "Кран шаровой №5 50/40").
  if (data.component) {
    const descriptor = parseVoiceEntityDescriptor(data.component);
    const synonymedName = normalizeBySynonyms(
      descriptor.name,
      "component",
    ).value;
    const fuzzy = fuzzyMatchOption(synonymedName, components);

    data.component = [
      normalizeComponentDisplayCase(fuzzy ?? synonymedName),
      descriptor.number ? `№${descriptor.number}` : null,
      descriptor.size,
    ]
      .filter(Boolean)
      .join(" ");
  }

  setVoiceData(data);
};
