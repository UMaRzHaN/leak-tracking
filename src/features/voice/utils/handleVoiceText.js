import {
  normalizeBySynonyms,
  normalizeVoiceResult,
  normalizeSynonyms,
  parseVoiceEntityDescriptor,
} from "./normalization";
import { parseVoiceText } from "./parseVoiceText";
import { fuzzyMatchOption } from "./matching";
import { objects, components } from "@/data/leak/fieldDictionary";

const normalizeComponentDisplayCase = (value) => {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  return words
    .map((word, index) => {
      // Keep technical abbreviations such as СППК, DN50 and PN16 intact.
      if (/^[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9./-]*$/u.test(word) && word.length > 1) {
        return word;
      }

      const lower = word.toLocaleLowerCase("ru-RU");
      return index === 0
        ? lower.charAt(0).toLocaleUpperCase("ru-RU") + lower.slice(1)
        : lower;
    })
    .join(" ");
};

/**
 * Full voice text processing pipeline.
 *
 * @param {string[]} arr          — synonym fields from project config
 * @param {string}   text         — raw recognized text
 * @param {Function} setVoiceData — state setter that receives parsed result
 * @param {string}   project      — project type ("upstream"|"midstream"|"downstream")
 * @param {string|null} dictationKey — key of textarea field in current step (for dictation mode)
 * @param {string[]} allowedFields — keys the asking entity can actually store
 * @param {Record<string, string[]>} fieldOptions — списки допустимых значений по
 *   полям. Приходят от сущности, а не лежат здесь: словари оборудования весят
 *   одиннадцать килобайт и нужны только реестру, а этот модуль грузится вместе
 *   с обеими формами.
 */
export const handleVoiceText = (
  arr,
  text,
  setVoiceData,
  project,
  dictationKey = null,
  allowedFields = [],
  fieldOptions = {},
) => {
  const parsed = parseVoiceText(text);
  const normalizedData = normalizeSynonyms(
    normalizeVoiceResult(parsed, project),
    arr,
  );
  const allowed = new Set(allowedFields);
  const data =
    allowed.size > 0
      ? Object.fromEntries(
          Object.entries(normalizedData).filter(([key]) => allowed.has(key)),
        )
      : normalizedData;

  // Dictation mode: no structured fields recognized → put raw text into textarea field
  if (dictationKey && Object.keys(data).length === 0) {
    setVoiceData({ [dictationKey]: text });
    return;
  }

  // Synonym normalization
  const SYNONYM_FIELDS = [
    ["actuator_type", "actuator_type"],
    ["connection_type", "connection_type"],
    ["installation_type", "installation_type"],
    ["leak_cause", "leak_cause"],
    ["leak_description", "leak_description"],
    ["materials_equipment", "component"],
  ];

  for (const [field, synonymKey] of SYNONYM_FIELDS) {
    if (data[field])
      data[field] = normalizeBySynonyms(data[field], synonymKey).value;
  }

  /*
   * Услышанное к словарю поля. Распознаватель отдаёт «запорная арматура» там,
   * где в списке стоит «Запорная арматура», и «сталь двадцать» там, где
   * «Сталь 20»: без сопоставления в карточку попадала бы строка, которой нет
   * ни в одном выпадающем списке, и человек правил бы её руками.
   */
  for (const [field, options] of Object.entries(fieldOptions)) {
    if (field === "component" || !data[field] || !options?.length) continue;
    const matched = fuzzyMatchOption(String(data[field]), options);
    if (matched) data[field] = matched;
  }

  // Fuzzy match object against objects dictionary
  if (data.object) {
    const synonymed = normalizeBySynonyms(data.object, "component").value;
    const fuzzy = fuzzyMatchOption(data.object, objects);
    data.object = fuzzy ?? synonymed;
  }

  // Fuzzy-match only the component name. Preserve an explicitly spoken
  // entity number and size instead of replacing the whole descriptor with
  // the dictionary option (for example, "Кран шаровой №5 50/40").
  if (data.component) {
    const descriptor = parseVoiceEntityDescriptor(data.component);
    const synonymedName = normalizeBySynonyms(
      descriptor.name,
      "component",
    ).value;
    /*
     * Список реестра — тот же железный шкаф, названный короче: «Задвижка»
     * против «Задвижка механическая стальная» у утечки. Сначала пробуем
     * услышанное как есть, и только потом — приведённое словарём синонимов:
     * тот словарь ведёт к именам утечки, и «задвижка» уходила в «ЗМС», после
     * чего в списке реестра ничего не находилось.
     */
    const options = fieldOptions.component ?? components;
    const fuzzy =
      fuzzyMatchOption(descriptor.name, options) ??
      fuzzyMatchOption(synonymedName, options);

    data.component = [
      normalizeComponentDisplayCase(fuzzy ?? synonymedName),
      descriptor.number ? `№${descriptor.number}` : null,
      descriptor.size,
    ]
      .filter(Boolean)
      .join(" ");
  }

  setVoiceData(data);
};
