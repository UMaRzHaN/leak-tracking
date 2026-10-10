import { readMonitoringRound } from "@/utils/monitoringRound";
import { activeRoundNumber } from "@/utils/projectRound";
import { repairRound } from "@/pages/Repairs/repairRoundStore";

/**
 * Один обход за раз: пока не завершён обход мониторинга, обход ремонтов не
 * начинается, и наоборот. Оба идут по тем же утечкам одними и теми же
 * людьми, и два открытых обхода сразу — это две незакрытые ведомости, из
 * которых ни одну не довели до конца.
 *
 * Сверка инвентаризации — исключение: она про железо, а не про утечки, и
 * ведётся своим порядком, поэтому в этом правиле её нет.
 */
export const ROUND_KIND = Object.freeze({
  MONITORING: "monitoring",
  REPAIRS: "repairs",
});

/** Номер идущего обхода модуля, иначе `undefined`. */
const ACTIVE_ROUND_NUMBER = {
  [ROUND_KIND.MONITORING]: (projectId) =>
    activeRoundNumber(readMonitoringRound(projectId)),
  [ROUND_KIND.REPAIRS]: (projectId) =>
    activeRoundNumber(repairRound.read(projectId)),
};

/**
 * Идущий обход другого модуля, из-за которого обход `kind` начинать нельзя.
 *
 * @param {string|null} projectId
 * @param {string} kind ROUND_KIND того, кто собирается начать обход
 * @returns {{ kind: string, number: number }|null}
 */
export function blockingRound(projectId, kind) {
  if (!projectId) return null;
  for (const [other, readNumber] of Object.entries(ACTIVE_ROUND_NUMBER)) {
    if (other === kind) continue;
    const number = readNumber(projectId);
    if (number !== undefined) return { kind: other, number };
  }
  return null;
}
