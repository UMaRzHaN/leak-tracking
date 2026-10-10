import { useCallback } from "react";
import { useProjectData } from "@/app/project/ProjectContext";
import { canSwipeCheckRepair } from "./repairRoundDomain";
import { repairRound } from "./repairRoundStore";

/**
 * Предикат для свайпа «Проверить ремонт» в списках вне обхода — «Записи» и
 * «База». Обход читается при каждом вызове: начатый на другом экране, он
 * должен действовать сразу, а не после перезахода. Вне модуля ремонтов свайп
 * ведёт в мониторинг, и предикат его не ограничивает.
 *
 * @param {boolean} repairMode
 * @returns {(leak: any) => boolean}
 */
export function useCanCheckRepair(repairMode) {
  const { activeProject } = useProjectData();
  const projectId = activeProject?.id ?? null;
  return useCallback(
    (leak) =>
      !repairMode || canSwipeCheckRepair(leak, repairRound.read(projectId)),
    [repairMode, projectId],
  );
}
