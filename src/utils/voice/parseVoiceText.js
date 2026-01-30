import { capitalizeFirst } from "../normalize/capitalizeFirst";
import { normalizeStationName } from "./normalize/normalizeStationName";

/**
 * ЕДИНЫЙ СПИСОК МАРКЕРОВ
 * Используется ТОЛЬКО в lookahead
 * НЕ должен иметь захватывающих скобок
 */
const FIELD_MARKERS =
  "бирк[аи]?|видео|скорост[ьи]?|давлени[ея]?|температур[аы]?|" +
  "умг|унг|умк|умгэ|умге|умга|омг|управление|район|подразделение|" +
  "категори[яи]|" + // 👈 ВОТ ТУТ
  "компрессорная станци[я]|станци[я]|место рождени[ея]|месторождени[ея]?|" +
  "локаци[яи]|адрес|" +
  "привод|тип привода|присоединени[ея]|тип присоединения|установк[аи]|тип установки|" +
  "объект|компонент[ы]?|" +
  "описание утечк[и]|причина утечк[и]|" +
  "технологическ(?:ое|ий) решени(?:е|я)|тех решени(?:е|я)|" +
  "способ устранени(?:я|й)|метод устранени(?:я|й)|" +
  "план устранения|мтр ремонта|мтр|примечани[ея]";

/* ================= HELPERS ================= */

function normalizeRuNumber(str) {
  if (!str) return str;

  let v = str.replace(/\u00A0/g, " ").replace(/\s+/g, "");

  const hasDot = v.includes(".");
  const hasComma = v.includes(",");

  if (hasDot && hasComma) return v.replace(/\./g, "").replace(",", ".");
  if (hasComma) return v.replace(",", ".");
  return v;
}

/* ================= PARSER ================= */

/**
 * ОБЩИЙ voice-парсер
 * ❗ НЕ знает про upstream / midstream / downstream
 * ❗ Возвращает ТОЛЬКО абстрактные ключи
 */
export const parseVoiceText = (text) => {
  const result = {};
  if (!text) return result;

  const normalized = text.toLowerCase();

  const patterns = [
    /* ===== ИДЕНТИФИКАТОРЫ ===== */
    {
      key: "leak_id",
      regex: /бирк[аи]?\s*(?<value>\d+)/g,
      type: "string",
    },
    {
      key: "video_id",
      regex: /видео\s*(?<value>\d+)/g,
      type: "string",
    },

    /* ===== ПАРАМЕТРЫ ===== */
    {
      key: "leak_speed",
      regex: /скорост[ьи]?\s*(?<value>[\d.,\s]+)/g,
      type: "number",
    },
    {
      key: "pressure",
      regex: /давлени[ея]?\s*(?<value>\d+(?:[.,]\d+)?)/g,
      type: "number",
    },
    {
      key: "temperature",
      regex: /температур[аы]?\s*(?<value>-?\d+(?:[.,]\d+)?)/g,
      type: "number",
    },
    {
      key: "category",
      regex: new RegExp(
        `(?:категори[яи])\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    /* ===== СЕМАНТИЧЕСКИЕ ЛОКАЦИИ ===== */

    // 1️⃣ Верхний уровень (УМГ / район / управление)
    {
      key: "main",
      regex: new RegExp(
        `(?:умг|унг|умк|умгэ|умге|умга|омг|управление|район|подразделени[еяйю])\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },

    // 2️⃣ Основной объект (станция / месторождение / населённый пункт)
    {
      key: "secondary",
      regex: new RegExp(
        `(?:компрессорная станци[я]|станци[я]|место рождени[ея]|месторождени[ея]|населённый пункт|пункт?)\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },

    // 3️⃣ Произвольная локация / адрес
    {
      key: "last",
      regex: new RegExp(
        `(?:локаци[яи]|адрес)\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },

    /* ===== ОБЪЕКТ ===== */
    {
      key: "object",
      regex: new RegExp(
        `объект\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "component",
      regex: new RegExp(
        `компонент[ы]?\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },

    /* ===== ОПИСАНИЯ ===== */
    {
      key: "leak_description",
      regex: new RegExp(
        `описание утечк[и]\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "leak_cause",
      regex: new RegExp(
        `причина утечк[и]\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "technological_solution",
      regex: new RegExp(
        `(?:технологическ(?:ое|ий) решени(?:е|я)|тех решени(?:е|я)|способ устранени(?:я|й)|метод устранени(?:я|й))\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "repair_recommendation",
      regex: new RegExp(
        `план устранения\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "materials_equipment",
      regex: new RegExp(
        `(?:мтр ремонта|мтр)\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "note",
      regex: new RegExp(
        `примечани[ея]\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "actuator_type",
      regex: new RegExp(
        `(?:тип привода|привод)\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "connection_type",
      regex: new RegExp(
        `(?:тип присоединения|присоединени[ея])\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
    {
      key: "installation_type",
      regex: new RegExp(
        `(?:тип установки|установк[аи])\\s+(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
        "g",
      ),
      type: "string",
    },
  ];

  patterns.forEach(({ key, regex, type }) => {
    const matches = [...normalized.matchAll(regex)];
    if (!matches.length) return;

    const rawValue = matches.at(-1)?.groups?.value;
    if (!rawValue) return;
    console.log(matches);

    if (key === "secondary") {
      const normalizedStation = normalizeStationName(rawValue);
      result[key] = normalizedStation;
      return;
    }

    if (type === "number") {
      const n = normalizeRuNumber(rawValue);
      if (n !== undefined) result[key] = Number(n);
      return;
    }

    result[key] = capitalizeFirst(rawValue.trim());
  });

  return result;
};
