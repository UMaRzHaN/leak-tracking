import { activeRoundNumber, createProjectRound } from "@/utils/projectRound";
import {
  canSwipeCheckRepair,
  moveRepairChecksToRound,
} from "./repairRoundDomain";

/**
 * Обход ремонтов — номер и начало, как у сверки реестра. Общий модуль: им
 * живёт экран обхода, а проверка ремонта метит свои события номером идущего
 * обхода, где бы её ни открыли.
 */
export const repairRound = createProjectRound("repair_round_v1");

/** Номер идущего обхода ремонтов проекта, иначе `undefined`. */
export function activeRepairRoundNumber(projectId) {
  return activeRoundNumber(repairRound.read(projectId));
}

/**
 * Слияние обхода ремонтов с предыдущим вместе с его проверками: сначала
 * записи переходят в предыдущий обход, потом сам обход сливается — не
 * записались, и обход остаётся каким был.
 *
 * @param {string|null} projectId
 * @param {any[]} data весь проект
 * @param {(next: any[]) => Promise<void>|void} setData
 * @returns {Promise<{number: number, startedAt: string}|null>}
 */
export async function mergeRepairRoundWithChecks(projectId, data, setData) {
  const current = repairRound.read(projectId);
  const previous = current?.previous;
  if (!previous?.startedAt || current.completedAt) return null;
  const { data: next, moved } = moveRepairChecksToRound(
    data,
    current.number,
    previous.number,
  );
  if (moved > 0) await setData(next);
  return repairRound.merge(projectId);
}

/**
 * Какие из ремонтов можно проверить — по тому же правилу, что свайп
 * (`canSwipeCheckRepair`): принятый перепроверяют, кроме принятого до начала
 * идущего обхода. Одно правило на свайп, карту и «Проверить» у выбранных.
 *
 * @param {string|null} projectId
 * @param {any[]} leaks
 */
export function repairsToCheck(projectId, leaks) {
  const round = repairRound.read(projectId);
  return (leaks ?? []).filter((leak) => canSwipeCheckRepair(leak, round));
}
