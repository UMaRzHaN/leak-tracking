import { SYNONYMS } from "../../../utils/synonyms";

export function normalizeSynonyms(data) {
  const result = { ...data };

  ["leak_cause", "repair_recommendation", "leak_description"].forEach(
    (field) => {
      if (!result[field]) return;

      const map = SYNONYMS[field];
      const value = result[field].toLowerCase();

      for (const [key, normalized] of Object.entries(map)) {
        if (value.includes(key)) {
          result[field] = normalized;
          break;
        }
      }
    }
  );

  return result;
}
