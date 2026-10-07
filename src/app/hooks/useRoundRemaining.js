import { useMemo } from "react";
import { MODULE } from "@/app/modules/activeModule";
import { getRepairLeaks } from "@/domain/repairStages";
import { liveComponents } from "@/domain/componentTombstones";
import { repairRound } from "@/pages/Repairs/repairRoundStore";
import { summarizeRepairRound } from "@/pages/Repairs/repairRoundDomain";
import {
  isReconciled,
  readReconcileRound,
} from "@/pages/Reconcile/reconcileRound";

/**
 * Счётчик на вкладке «База»: сколько осталось проверить в идущем обходе
 * модуля — одно и то же для мониторинга, ремонтов и сверки. Без идущего
 * обхода — `null`, и счётчика нет: «осталось» не от чего считать.
 *
 * Обходы ремонтов и сверки событий не шлют, поэтому перечитываются при
 * смене страницы: начать или завершить их можно только на своём экране.
 *
 * @param {{ module: string, page: string, projectId: string|null,
 *   leaks: any[], components: any[], monitoringDue: number|null }} options
 * @returns {number|null}
 */
export function useRoundRemaining({
  module,
  page,
  projectId,
  leaks,
  components,
  monitoringDue,
}) {
  return useMemo(() => {
    if (module === MODULE.MONITORING) return monitoringDue;
    void page;
    if (module === MODULE.REPAIRS) {
      const round = repairRound.read(projectId);
      if (!round || round.completedAt) return null;
      return summarizeRepairRound(getRepairLeaks(leaks), round).due;
    }
    if (module === MODULE.INVENTORY) {
      const round = readReconcileRound(projectId);
      if (!round || round.completedAt) return null;
      return liveComponents(components).filter(
        (component) => !isReconciled(component, round),
      ).length;
    }
    return null;
  }, [module, page, projectId, leaks, components, monitoringDue]);
}
