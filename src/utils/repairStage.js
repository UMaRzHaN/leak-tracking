import { REPAIR_STAGE } from "@/domain/repairStages";

/**
 * Цвета стадий ремонта — те же тройки «надпись + плашка + рамка», что у
 * статусов, чтобы значок стадии вставал в шапку карточки на место статуса.
 * «В ремонте» синий, а не янтарный: янтарный в журнале занят «Ожидает МТР»
 * (7a), и две стадии одного цвета не различались бы.
 */
const STAGE_META = {
  [REPAIR_STAGE.WAITING_MTR]: {
    color: "var(--c-progress-text)",
    bg: "var(--c-progress-bg)",
    border: "var(--c-progress-border)",
    dot: "var(--c-progress)",
  },
  [REPAIR_STAGE.IN_REPAIR]: {
    color: "var(--c-medium)",
    bg: "var(--c-medium-bg)",
    border: "var(--c-medium-border)",
    dot: "var(--c-medium)",
  },
  [REPAIR_STAGE.RESOLVED]: {
    color: "var(--c-resolved-text)",
    bg: "var(--c-resolved-bg)",
    border: "var(--c-resolved-border)",
    dot: "var(--c-resolved)",
  },
};

export const REPAIR_STAGE_ORDER = [
  REPAIR_STAGE.WAITING_MTR,
  REPAIR_STAGE.IN_REPAIR,
  REPAIR_STAGE.RESOLVED,
];

export function getRepairStageMeta(stage, t) {
  const meta = STAGE_META[stage] ?? STAGE_META[REPAIR_STAGE.IN_REPAIR];
  return { ...meta, label: t(`repairs.stages.${stage}`) };
}

const MATERIAL_CHIPS = 4;

/**
 * МТР из поля формы — по одной позиции на чип.
 *
 * Перенос строки делит позиции, только если следующая строка начинается не
 * со строчной буквы: в ячейках книги длинное название переносят посреди
 * фразы («…с ручным приводом с⏎ответными фланцами»), и такой хвост — то же
 * название, а не новая позиция.
 */
export function splitMaterials(value) {
  return String(value ?? "")
    .split("\n")
    .reduce((lines, line) => {
      const text = line.trim();
      if (!text) return lines;
      if (lines.length && /^\p{Ll}/u.test(text)) {
        lines[lines.length - 1] += ` ${text}`;
      } else {
        lines.push(text);
      }
      return lines;
    }, /** @type {string[]} */ ([]))
    .flatMap((line) => line.split(/[,;]/))
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((chips, item, index, items) => {
      // Чипов не больше четырёх; что не влезло — последним чипом «+N»,
      // чтобы позиции не пропадали молча.
      if (index < MATERIAL_CHIPS) chips.push(item);
      else if (index === MATERIAL_CHIPS) chips.push(`+${items.length - index}`);
      return chips;
    }, /** @type {string[]} */ ([]));
}
