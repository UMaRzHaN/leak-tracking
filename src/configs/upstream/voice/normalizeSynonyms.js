import { SYNONYMS } from "../../../utils/voice/synonyms";

export function normalizeSynonyms(data) {
  const result = { ...data };

  [
    "repair_recommendation",
    "leak_description",
    "component",
    "actuator_type",
    "connection_type",
    "installation_type",
  ].forEach((field) => {
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
