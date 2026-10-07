import { activeRoundNumber, createProjectRound } from "@/utils/projectRound";

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
