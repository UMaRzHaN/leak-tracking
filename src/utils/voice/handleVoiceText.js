import { normalizeEquipment } from "../normalize/normalizeEquipment";
import { normalizeNumberWords } from "../normalize/normalizeNumberWords";

export const handleVoiceText = (
  text,
  pipeline,
  setVoiceData,
  setPage,
) => {
  if (!pipeline || pipeline.length < 2) return;

  const [parseVoiceText, normalizeSynonyms] = pipeline;

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
