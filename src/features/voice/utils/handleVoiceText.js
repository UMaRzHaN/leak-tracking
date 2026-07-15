import {
  normalizeBySynonyms,
  normalizeVoiceResult,
  normalizeSynonyms,
} from "./normalization";
import { normalizeNumberWords } from "./numbers";
import { parseVoiceText } from "./parseVoiceText";
import { fuzzyMatchOption } from "./matching";
import { objects, components } from "@/data/leak/fieldDictionary";

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
  const normalizedText = normalizeNumberWords(text);
  const parsed = parseVoiceText(normalizedText);
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
    ["component", "component"],
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

  // Fuzzy match component against components dictionary (fallback after synonyms)
  if (data.component) {
    const fuzzy = fuzzyMatchOption(data.component, components);
    if (fuzzy) data.component = fuzzy;
  }

  setVoiceData(data);
};
