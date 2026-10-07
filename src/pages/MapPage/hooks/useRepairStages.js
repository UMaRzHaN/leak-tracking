import { useMemo, useState } from "react";
import {
  countRepairStages,
  getRepairLeaks,
  getRepairStage,
} from "@/domain/repairStages";

/**
 * Карта модуля ремонтов (7i): только ремонты и отбор по стадии работ. Вне
 * ремонтов записи проходят как есть, а счётчиков стадий нет.
 */
export function useRepairStages(leaks, repairMode) {
  const [stage, setStage] = useState("all");
  const repairLeaks = useMemo(
    () => (repairMode ? getRepairLeaks(leaks) : null),
    [repairMode, leaks],
  );
  const stageCounts = useMemo(
    () => (repairLeaks ? countRepairStages(repairLeaks) : null),
    [repairLeaks],
  );
  const shownLeaks = useMemo(() => {
    if (!repairLeaks) return leaks;
    return stage === "all"
      ? repairLeaks
      : repairLeaks.filter((leak) => getRepairStage(leak) === stage);
  }, [repairLeaks, leaks, stage]);

  return { stage, setStage, stageCounts, shownLeaks };
}
