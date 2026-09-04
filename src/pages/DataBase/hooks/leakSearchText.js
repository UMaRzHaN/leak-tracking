import { getAllMonitoringRecords } from "@/utils/monitoring";
import { ABBREV_MAP } from "@/features/search/Autocomplete/smartFilter";

/**
 * Текст записи для поиска: всё, по чему её могут искать, одной строкой.
 *
 * Собирается и из обходов с историей, а не только из полей: в поле помнят
 * фамилию обходчика и слово из примечания, а не индивидуальный номер. Заодно
 * строятся сокращения — «КШ» находит «кран шаровой», как его и называют вслух.
 */
const SEARCH_KEYS = [
  "id",
  "leak_id",
  "video_id",
  "subdivision",
  "deposit",
  "field",
  "station",
  "district",
  "locality",
  "address",
  "location",
  "object",
  "category",
  "component",
  "leak_description",
  "leak_cause",
  "technological_solution",
  "repair_recommendation",
  "materials_equipment",
  "note",
  "detectedBy",
  "equipmentType",
  "serial_number",
];

const MONITORING_SEARCH_KEYS = [
  "monitoredBy",
  "comment",
  "materials_equipment",
  "result",
];

const HISTORY_SEARCH_KEYS = ["user", "text", "from", "to"];

export function normalizeLeakSearchText(value) {
  return String(value ?? "")
    .replace(/[№#]/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function collectValues(source, keys) {
  if (!source || typeof source !== "object") return [];
  return keys.map((key) => source[key]).filter((value) => value != null);
}

const ACRONYM_STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "для",
  "с",
  "со",
  "за",
  "из",
  "к",
  "of",
  "the",
  "and",
  "for",
]);

const NORMALIZED_ABBREVIATIONS = Object.entries(ABBREV_MAP).map(
  ([abbreviation, expanded]) => [
    normalizeLeakSearchText(abbreviation),
    normalizeLeakSearchText(expanded),
  ],
);

function buildSearchAcronyms(values) {
  const normalizedValues = values
    .filter((value) => value != null && String(value).trim())
    .map(normalizeLeakSearchText);
  const combined = normalizedValues.join(" ");
  const acronyms = new Set();

  for (const value of normalizedValues) {
    const words = value
      .split(" ")
      .filter((word) => word && !ACRONYM_STOP_WORDS.has(word));
    if (words.length >= 2 && words.length <= 8) {
      acronyms.add(words.map((word) => word[0]).join(""));
    }
  }

  for (const [abbreviation, expanded] of NORMALIZED_ABBREVIATIONS) {
    if (expanded && combined.includes(expanded)) {
      acronyms.add(abbreviation);
    }
  }

  return [...acronyms].join(" ");
}

export function buildLeakSearchText(leak) {
  const tag = leak?.leak_id ?? "";
  const values = [
    ...collectValues(leak, SEARCH_KEYS),
    `бирка ${tag}`,
    `tag ${tag}`,
    `б ${tag}`,
    `b ${tag}`,
    `т ${tag}`,
    `t ${tag}`,
  ];

  // Все обходы, включая недатированные: искать по ним человек всё равно
  // может, а дата поиску не нужна.
  for (const record of getAllMonitoringRecords(leak)) {
    values.push(...collectValues(record, MONITORING_SEARCH_KEYS));
  }
  for (const entry of leak?.history ?? []) {
    values.push(...collectValues(entry, HISTORY_SEARCH_KEYS));
    for (const change of entry?.changes ?? []) {
      values.push(change?.from, change?.to);
    }
  }

  return normalizeLeakSearchText(
    `${values.join(" ")} ${buildSearchAcronyms(values)}`,
  );
}

export function matchesLeakSearch(leak, query) {
  const normalizedQuery = normalizeLeakSearchText(query);
  if (!normalizedQuery) return true;
  const searchText = buildLeakSearchText(leak);
  return normalizedQuery
    .split(" ")
    .every((token) => searchText.includes(token));
}
