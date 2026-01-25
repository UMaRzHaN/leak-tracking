import { normalizeEquipment } from "./normalizeEquipment";
import { normalizeNumberWords } from "./normalizeNumberWords";
import { VOICE_COMPRESSION } from "../configs/compression/compressions.config";
const normalizeSynonyms = VOICE_COMPRESSION.pipeline[1],
  parseVoiceText = VOICE_COMPRESSION.pipeline[0];
export const handleVoiceText = (text, setVoiceData, setPage) => {
  const normalizedText = normalizeNumberWords(text);
  const parsed = parseVoiceText(normalizedText);
  const data = normalizeSynonyms(parsed);

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
