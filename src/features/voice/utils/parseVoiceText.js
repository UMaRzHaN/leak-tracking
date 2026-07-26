import { capitalizeFirst } from "@/utils/normalize/capitalizeFirst";
import { normalizeStationName } from "./normalization";
import { normalizeNumberWords } from "./numbers";

const TOKENS = {
  leakId:
    "номер\\s+(?:бирки|утечки|тега)|id\\s+утечки|ид\\s+утечки|бирк[аи]?|тег|leak\\s+id|tag(?:\\s+number)?",

  videoId: "номер\\s+видео|id\\s+видео|видео\\s+id|видео|video\\s+id|video",

  leakSpeed:
    "скорост(?:ь|и)?\\s+утечки|скорость\\s+выброса|расход\\s+утечки|скорост(?:ь|и)?|leak\\s+(?:rate|speed)|rate|speed",

  pressure: "давлени(?:е|я|ю|и)?|pressure",
  temperature: "температур(?:а|ы|у|е)?|temperature|temp",
  category: "категори(?:я|и|ю)?|category",

  main: [
    "умг",
    "унг",
    "умк",
    "умгэ",
    "умге",
    "умга",
    "омг",
    "мгпа",
    "mgpa",
    "main\\s+gas\\s+pipeline\\s+administration",
    "управлени(?:е|я|ю)",
    "management",
    "подразделени(?:е|я|ю)",
    "subdivision",
    "district",
    "район",
    "field",
  ].join("|"),

  secondary: [
    // Put longer phrases first: regex alternation uses the first match.
    "место\\s+рождени(?:е|я)\\s+газа",
    "место\\s+рождени(?:е|я)",
    "месторождени(?:е|я)",
    "компрессорн(?:ая|ой|ую)\\s+станци(?:я|и|ю)",
    "compressor\\s+station",
    "станци(?:я|и|ю)",
    "кс",
    "нефтян(?:ое|ого)\\s+месторождени(?:е|я)",
    "газов(?:ое|ого)\\s+месторождени(?:е|я)",
    "oil\\s+field",
    "gas\\s+field",
    "field\\s+deposit",
    "deposit",
    "насел[её]нн(?:ый|ого|ом)\\s+пункт",
    "locality",
    "settlement",
    "station",
    "town",
    "city",
    "пункт",
  ].join("|"),

  last: [
    "локаци(?:я|и|ю)",
    "местоположени(?:е|я)",
    "адрес(?:а|у|е)?",
    "location",
    "address",
  ].join("|"),

  object: "объект(?:а|е|у|ом)?|object",
  component: "компонент(?:ы|а|е|у|ом)?|component",

  leakDescription:
    "описани(?:е|я)\\s+утечки|описать\\s+утечку|leak\\s+description|description",

  leakCause: "причин(?:а|ы|у)\\s+утечки|leak\\s+cause|cause",

  technologicalSolution: [
    "технологическ(?:ое|ого)\\s+решени(?:е|я)",
    "техническ(?:ое|ого)\\s+решени(?:е|я)",
    "тех\\s+решени(?:е|я)",
    "способ\\s+устранени(?:я|е)",
    "technical\\s+solution",
    "method\\s+of\\s+repair",
    "repair\\s+method",
    "solution",
  ].join("|"),

  repairRecommendation: [
    "план\\s+устранени(?:я|е)",
    "рекомендаци(?:я|и|ю)\\s+по\\s+ремонту",
    "repair\\s+plan",
    "repair\\s+recommendation",
    "recommendation",
  ].join("|"),

  materialsEquipment: [
    "мтр\\s+ремонта",
    "мтр",
    "материал(?:ы|ов)",
    "оборудовани(?:е|я)",
    "materials\\s+and\\s+equipment",
    "materials",
    "equipment",
  ].join("|"),

  note: "примечани(?:е|я)|заметк(?:а|и|у)|комментари(?:й|я)|note|comment",

  actuatorType:
    "тип\\s+привода|вид\\s+привода|привод(?:а)?|actuator\\s+type|actuator",

  connectionType:
    "тип\\s+присоединени(?:я|е)|тип\\s+соединени(?:я|е)|присоединени(?:е|я)|connection\\s+type",

  installationType:
    "тип\\s+установки|вид\\s+установки|установк(?:а|и|у|е)|installation\\s+type|installation",
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

  // Speech recognition often splits "месторождение" into "место рождения".
  // Canonicalize that phrase before number-word normalization so it cannot be
  // changed or split by another normalization rule.
  const canonicalText = text.replace(
    /(^|\s)место\s+рождени(?:е|я)(?:\s+газа)?(?=\s|$)/gi,
    "$1месторождение",
  );
  const normalized = normalizeNumberWords(canonicalText).toLowerCase();

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
