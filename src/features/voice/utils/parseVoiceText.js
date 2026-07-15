import { capitalizeFirst } from "@/utils/normalize/capitalizeFirst";
import { normalizeStationName } from "./normalization";
import { normalizeNumberWords } from "./numbers";

const TOKENS = {
  leakId: "бирк[аи]?|tag(?:\\s+number)?|tag",
  videoId: "видео|video",
  leakSpeed: "скорост[ьи]?\\s+утечки|скорост[ьи]?|leak\\s+rate|rate|speed",
  pressure: "давлени[ея]?|pressure",
  temperature: "температур[аы]?|temperature|temp",
  category: "категори[яи]|category",
  main: "умг|унг|умк|умгэ|умге|умга|омг|mgpa|main\\s+gas\\s+pipeline\\s+administration|управление|management|district|район|подразделени[еяю]|subdivision|field",
  secondary:
    "компрессорная\\s+станци[яи]|станци[яи]|compressor\\s+station|station|место\\s+рождени[ея]|месторождени[ея]?|deposit|field\\s+deposit|насел[её]нный\\s+пункт|locality|settlement|town|city|пункт",
  last: "локаци[яи]|location|address|адрес",
  object: "объект|object",
  component: "компонент[ы]?|component",
  leakDescription: "описание\\s+утечки|leak\\s+description|description",
  leakCause: "причина\\s+утечки|leak\\s+cause|cause",
  technologicalSolution:
    "технологическое\\s+решение|тех\\s+решение|technical\\s+solution|solution|способ\\s+устранения|method\\s+of\\s+repair|repair\\s+method",
  repairRecommendation:
    "план\\s+устранения|repair\\s+plan|repair\\s+recommendation|recommendation",
  materialsEquipment:
    "мтр\\s+ремонта|мтр|materials\\s+and\\s+equipment|materials|equipment",
  note: "примечани[ея]|note|comment",
  actuatorType: "тип\\s+привода|привод|actuator\\s+type|actuator",
  connectionType: "тип\\s+присоединения|присоединени[ея]|connection\\s+type",
  installationType:
    "тип\\s+установки|установк[аи]|installation\\s+type|installation",
};

const FIELD_MARKERS = [
  TOKENS.leakId,
  TOKENS.videoId,
  TOKENS.leakSpeed,
  TOKENS.pressure,
  TOKENS.temperature,
  TOKENS.category,
  TOKENS.main,
  TOKENS.secondary,
  TOKENS.last,
  TOKENS.object,
  TOKENS.component,
  TOKENS.leakDescription,
  TOKENS.leakCause,
  TOKENS.technologicalSolution,
  TOKENS.repairRecommendation,
  TOKENS.materialsEquipment,
  TOKENS.note,
  TOKENS.actuatorType,
  TOKENS.connectionType,
  TOKENS.installationType,
].join("|");

const FILLER_WORDS =
  "(?:это|равно|составляет|будет|такой|такая|такое|номер)\\s+";

function normalizeNumber(str) {
  if (!str) return str;

  let value = str.replace(/\u00A0/g, " ").replace(/\s+/g, "");
  const hasDot = value.includes(".");
  const hasComma = value.includes(",");

  if (hasDot && hasComma) return value.replace(/\./g, "").replace(",", ".");
  if (hasComma) return value.replace(",", ".");
  return value;
}

function captureValue(marker) {
  return new RegExp(
    `(?:${marker})\\s+(?:${FILLER_WORDS})?(?<value>.+?)(?=\\s+(?:${FIELD_MARKERS})|$)`,
    "g",
  );
}

function captureNumber(marker) {
  return new RegExp(
    `(?:${marker})\\s*(?:${FILLER_WORDS})?(?<value>-?[\\d.,\\s]+)`,
    "g",
  );
}

function formatCapturedText(value) {
  const text = value.trim();
  if (!text) return text;

  if (/^[a-z0-9\s\-/.(),]+$/i.test(text)) {
    return text
      .split(/\s+/)
      .map((word) => {
        if (!word || /^\d/.test(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  return capitalizeFirst(text);
}

export const parseVoiceText = (text) => {
  const result = {};
  if (!text) return result;

  const normalized = normalizeNumberWords(text).toLowerCase();

  const patterns = [
    {
      key: "leak_id",
      regex: new RegExp(`(?:${TOKENS.leakId})\\s*(?<value>\\d+)`, "g"),
      type: "string",
    },
    {
      key: "video_id",
      regex: new RegExp(`(?:${TOKENS.videoId})\\s*(?<value>\\d+)`, "g"),
      type: "string",
    },
    {
      key: "leak_speed",
      regex: captureNumber(TOKENS.leakSpeed),
      type: "number",
    },
    {
      key: "pressure",
      regex: captureNumber(TOKENS.pressure),
      type: "number",
    },
    {
      key: "temperature",
      regex: captureNumber(TOKENS.temperature),
      type: "number",
    },
    { key: "category", regex: captureValue(TOKENS.category), type: "string" },
    { key: "main", regex: captureValue(TOKENS.main), type: "string" },
    { key: "secondary", regex: captureValue(TOKENS.secondary), type: "string" },
    { key: "last", regex: captureValue(TOKENS.last), type: "string" },
    { key: "object", regex: captureValue(TOKENS.object), type: "string" },
    { key: "component", regex: captureValue(TOKENS.component), type: "string" },
    {
      key: "leak_description",
      regex: captureValue(TOKENS.leakDescription),
      type: "string",
    },
    {
      key: "leak_cause",
      regex: captureValue(TOKENS.leakCause),
      type: "string",
    },
    {
      key: "technological_solution",
      regex: captureValue(TOKENS.technologicalSolution),
      type: "string",
    },
    {
      key: "repair_recommendation",
      regex: captureValue(TOKENS.repairRecommendation),
      type: "string",
    },
    {
      key: "materials_equipment",
      regex: captureValue(TOKENS.materialsEquipment),
      type: "string",
    },
    { key: "note", regex: captureValue(TOKENS.note), type: "string" },
    {
      key: "actuator_type",
      regex: captureValue(TOKENS.actuatorType),
      type: "string",
    },
    {
      key: "connection_type",
      regex: captureValue(TOKENS.connectionType),
      type: "string",
    },
    {
      key: "installation_type",
      regex: captureValue(TOKENS.installationType),
      type: "string",
    },
  ];

  patterns.forEach(({ key, regex, type }) => {
    const matches = [...normalized.matchAll(regex)];
    if (!matches.length) return;

    const rawValue = matches.at(-1)?.groups?.value;
    if (!rawValue) return;

    if (key === "secondary") {
      result[key] = normalizeStationName(rawValue);
      return;
    }

    if (type === "number") {
      const value = normalizeNumber(rawValue);
      const num = Number(value);
      if (value && !Number.isNaN(num)) result[key] = num;
      return;
    }

    result[key] = formatCapturedText(rawValue);
  });

  return result;
};
