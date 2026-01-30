import { SYNONYMS } from "../synonyms";

export function normalizeSynonyms(data, list) {
  const result = { ...data };

  list.forEach((field) => {
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
