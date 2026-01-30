import { normalizeBySynonyms } from "./normalize/normalizeBySynonyms";
import { normalizeNumberWords } from "./normalize/normalizeNumberWords";
import { normalizeVoiceResult } from "./normalize/normalizeVoiceResult";
import { normalizeSynonyms } from "./normalize/normalizeSynonyms";
import { parseVoiceText } from "./parseVoiceText";

export const handleVoiceText = (arr, text, setVoiceData, project) => {
  const normalizedText = normalizeNumberWords(text);
  const parsed = parseVoiceText(normalizedText);
  const normalizedresult = normalizeVoiceResult(parsed, project);

  const data = normalizedresult || normalizeSynonyms(normalizedresult, arr);

  if (data.component) {
    data.component = normalizeBySynonyms(data.component, "component").value;
  }

  if (data.object) {
    data.object = normalizeBySynonyms(data.object, "component").value;
  }

  if (data.actuator_type) {
    data.actuator_type = normalizeBySynonyms(
      data.actuator_type,
      "actuator_type",
    ).value;
  }

  if (data.connection_type) {
    data.connection_type = normalizeBySynonyms(
      data.connection_type,
      "connection_type",
    ).value;
  }

  if (data.installation_type) {
    data.installation_type = normalizeBySynonyms(
      data.installation_type,
      "installation_type",
    ).value;
  }

  // midstream only — но нормализатор сам это обработает
  if (data.leak_cause) {
    data.leak_cause = normalizeBySynonyms(data.leak_cause, "leak_cause").value;
  }

  if (data.leak_description) {
    data.leak_description = normalizeBySynonyms(
      data.leak_description,
      "leak_description",
    ).value;
  }

  if (data.materials_equipment) {
    data.materials_equipment = normalizeBySynonyms(
      data.materials_equipment,
      "component",
    ).value;
  }

  setVoiceData(data);
};
