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
  [REPAIR_STAGE.READY]: {
    color: "var(--c-resolved-text)",
    bg: "var(--c-resolved-bg)",
    border: "var(--c-resolved-border)",
    dot: "var(--c-resolved)",
  },
  [REPAIR_STAGE.ACCEPTED]: {
    color: "var(--c-text2)",
    bg: "var(--c-surface2)",
    border: "var(--c-border)",
    dot: "var(--c-text3)",
  },
};

export const REPAIR_STAGE_ORDER = [
  REPAIR_STAGE.WAITING_MTR,
  REPAIR_STAGE.IN_REPAIR,
  REPAIR_STAGE.READY,
  REPAIR_STAGE.ACCEPTED,
];

export function getRepairStageMeta(stage, t) {
  const meta = STAGE_META[stage] ?? STAGE_META[REPAIR_STAGE.IN_REPAIR];
  return { ...meta, label: t(`repairs.stages.${stage}`) };
}

/** МТР из поля формы — по одной позиции на чип. */
export function splitMaterials(value) {
  return String(value ?? "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}
