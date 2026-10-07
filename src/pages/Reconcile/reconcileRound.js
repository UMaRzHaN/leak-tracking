import {
  activeRoundNumber,
  createProjectRound,
  isInRound,
} from "@/utils/projectRound";

/**
 * Сверка реестра (6b) — аналог обхода мониторинга. Сверенным считается
 * компонент, осмотренный после начала сверки. Отдельного списка «сверено»
 * нет: отметка осмотра (`inspected_at`) уже лежит в карточке и уходит в
 * выгрузку инвентаризации.
 */
const round = createProjectRound("reconcile_round_v1");

export const readReconcileRound = round.read;
export const startReconcileRound = round.start;
export const finishReconcileRound = round.finish;
export const mergeReconcileRound = round.merge;

export function isReconciled(component, current) {
  return isInRound(component?.inspected_at, current);
}

/** Номер идущей сверки проекта — им метятся осмотры компонентов. */
export function activeReconcileRoundNumber(projectId) {
  return activeRoundNumber(round.read(projectId));
}
