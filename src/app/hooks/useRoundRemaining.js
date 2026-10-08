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
 * обхода — `null`, и счётчика нет: «осталось» не от чего считать. Рядом —
 * остаток сверки для пункта «Инвентаризация» в меню (пока меню открыто).
 *
 * Обходы ремонтов и сверки событий не шлют, поэтому перечитываются при
 * смене страницы: начать или завершить их можно только на своём экране.
 *
 * @param {{ module: string, page: string, menuOpen?: boolean,
 *   projectId: string|null, leaks: any[], components: any[],
 *   monitoringDue: number|null }} options
 * @returns {{ remaining: number|null, reconcileDue: number|null }}
 */
export function useRoundRemaining({
  module,
  page,
  menuOpen = false,
  projectId,
  leaks,
  components,
  monitoringDue,
}) {
  const reconcileDue = useMemo(() => {
    void page;
    return menuOpen || module === MODULE.INVENTORY
      ? reconcileRemaining(projectId, components)
      : null;
  }, [menuOpen, module, page, projectId, components]);

  const remaining = useMemo(() => {
    if (module === MODULE.MONITORING) return monitoringDue;
    if (module === MODULE.INVENTORY) return reconcileDue;
    if (module !== MODULE.REPAIRS) return null;
    void page;
    const round = repairRound.read(projectId);
    if (!round || round.completedAt) return null;
    return summarizeRepairRound(getRepairLeaks(leaks), round).due;
  }, [module, page, projectId, leaks, monitoringDue, reconcileDue]);

  return { remaining, reconcileDue };
}

/**
 * Сколько компонентов не сверено в идущей сверке; без неё — `null`. Им же
 * подписан пункт «Инвентаризация» в меню, как «N к проверке» у мониторинга.
 *
 * @param {string|null} projectId
 * @param {any[]} components
 * @returns {number|null}
 */
export function reconcileRemaining(projectId, components) {
  const round = readReconcileRound(projectId);
  if (!round || round.completedAt) return null;
  return liveComponents(components).filter(
    (component) => !isReconciled(component, round),
  ).length;
}
