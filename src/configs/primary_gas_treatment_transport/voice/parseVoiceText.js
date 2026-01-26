import { capitalizeFirst } from "../../../utils/capitalizeFirst";

/**
 * ЕДИНЫЙ СПИСОК МАРКЕРОВ
 * ❗ Используется ТОЛЬКО в lookahead
 * ❗ НЕ должен иметь захватывающих скобок
 */
const FIELD_MARKERS =
  "бирк[аи]?|видео|скорост[ьи]?|давлени[ея]?|температур[аы]?|" +
  "умг|унг|умк|умгэ|умге|умга|омг|управление|" +
  "компрессорная станци[я]|станци[я]|" +
  "локаци[яи]|объект|компонент[ы]?|" +
  "описание утечк[и]|причина утечк[и]|" +
  "технологическ(ое|ий) решени(е|я)|тех решени(е|я)|способ устранени(я|й)|метод устранени(я|й)|" +
  "план устранения|мтр|примечани[ея]";

export const parseVoiceText = (text) => {
  const result = {};
  if (!text) return result;

  function normalizeRuNumber(str) {
    if (!str) return str;

    let v = str.replace(/\u00A0/g, " ").replace(/\s+/g, "");

    const hasDot = v.includes(".");
    const hasComma = v.includes(",");

    if (hasDot && hasComma) {
      return v.replace(/\./g, "").replace(",", ".");
    }

    if (hasComma) {
      return v.replace(",", ".");
    }

    return v;
  }
  const normalized = text.toLowerCase();
  const patterns = [
    /* ===== ЧИСЛА ===== */
    { key: "leak_id", regex: /бирк[аи]?\s*(\d+)/, type: "string" },
    { key: "video_id", regex: /видео\s*(\d+)/, type: "string" },
    {
      key: "leak_speed",
      regex: /скорост[ьи]?\s*([\d.,\s]+)/,
      type: "string",
    },
    {
      key: "pressure",
      regex: /давлени[ея]?\s*(\d+(\.\d+)?)/,
      type: "string",
    },
    {
      key: "temperature",
      regex: /температур[аы]?\s*(-?\d+(\.\d+)?)/,
      type: "string",
    },

    /* ===== STRING (ВСЕ ПО ОДНОМУ ПРИНЦИПУ) ===== */
    {
      key: "field",
      regex: new RegExp(
        `(?:умг|унг|умк|умгэ|умге|умга|омг|управление)\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "station",
      regex: new RegExp(
        `компрессорная станци[я]\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "location",
      regex: new RegExp(`локаци[яи]\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "object",
      regex: new RegExp(`объект\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "component",
      regex: new RegExp(`компонент[ы]?\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "leak_description",
      regex: new RegExp(
        `описание утечк[и]\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "leak_cause",
      regex: new RegExp(
        `причина утечк[и]\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "technological_solution",
      regex: new RegExp(
        `(технологическ(ое|ий) решени(е|я)|тех решени(е|я)|способ устранени(я|й)|метод устранени(я|й))\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "repair_recommendation",
      regex: new RegExp(
        `план устранения\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
      ),
      type: "string",
    },
    {
      key: "materials_equipment",
      regex: new RegExp(`мтр\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "note",
      regex: new RegExp(`примечани[ея]\\s+(.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
  ];

  patterns.forEach(({ key, regex, type }) => {
    const match = normalized.match(regex);
    if (!match) return;

    if (type === "number") {
      const raw = match[1];
      const fixed = normalizeRuNumber(raw);
      result[key] = Number(fixed);
    } else {
      // берём ПОСЛЕДНЮЮ строковую группу (без маркеров)
      const value = match.findLast((v) => typeof v === "string" && v.trim());
      if (!value) return;
      result[key] = capitalizeFirst(value.trim());
    }
  });
  console.log(result);

  return result;
};
