import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
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

/** Хранилище целиком — для бэкапа и обмена (см. projectRounds). */
export const reconcileRoundStore = round;

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

/**
 * Сверка начата по ошибке: осмотры, записанные в ней, уходят в предыдущую —
 * как при слиянии обходов мониторинга. Компонент возвращается тем же, если
 * его не тронуло.
 *
 * @param {any[]} components
 * @param {number} from номер слитой сверки
 * @param {number} to номер предыдущей
 */
export function moveReconcileChecksToRound(components, from, to) {
  return (Array.isArray(components) ? components : []).map((component) => {
    if (!Array.isArray(component?.history)) return component;
    let touched = false;
    const history = component.history.map((entry) => {
      if (
        entry?.action !== COMPONENT_HISTORY_ACTIONS.INSPECTED ||
        Number(entry.roundNumber) !== Number(from)
      ) {
        return entry;
      }
      touched = true;
      return { ...entry, roundNumber: to };
    });
    return touched ? { ...component, history } : component;
  });
}

/**
 * Слияние сверки с предыдущей вместе с её осмотрами: сначала записи, потом
 * сама сверка — не записались, и сверка остаётся какой была.
 *
 * @param {string|null} projectId
 * @param {(recompute: (current: any[]) => any[]) => Promise<any>} rewrite запись реестра целиком
 */
export async function mergeReconcileRoundWithChecks(projectId, rewrite) {
  const current = round.read(projectId);
  const previous = current?.previous;
  if (!previous?.startedAt || current.completedAt) return null;
  await rewrite((components) =>
    moveReconcileChecksToRound(components, current.number, previous.number),
  );
  return round.merge(projectId);
}
