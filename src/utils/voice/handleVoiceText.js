import { normalizeEquipment } from "../normalize/normalizeEquipment";
import { normalizeNumberWords } from "../normalize/normalizeNumberWords";
import { normalizeVoiceResult } from "./normalizeVoiceResult";
import { normalizeSynonyms } from "./normalizeSynonyms";
import { parseVoiceText } from "./parseVoiceText";

export const handleVoiceText = (
  arr,
  text,
  setVoiceData,
  setPage,
  project,
) => {
  const normalizedText = normalizeNumberWords(text);
  const parsed = parseVoiceText(normalizedText);
  const normalizedresult = normalizeVoiceResult(parsed, project);

  const data = normalizedresult || normalizeSynonyms(normalizedresult, arr);

  if (data.component) {
    const r = normalizeEquipment(data.component);
    data.component = r.value;
    if (r.type) data.component_type = r.type;
  }

  if (data.object) {
    const r = normalizeEquipment(data.object);
    data.object = r.value;
    if (r.type) data.object_type = r.type;
  }

  setVoiceData(data);
  setPage("add");
};
