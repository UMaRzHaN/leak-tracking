import { useCallback, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  EXCEL_MONITORING_EXPORT_MODE,
  normalizeExcelMonitoringExportMode,
} from "@/utils/excelExportMode";

function readExportMode(storageKey) {
  if (!storageKey) return EXCEL_MONITORING_EXPORT_MODE.FULL;
  try {
    return normalizeExcelMonitoringExportMode(localStorage.getItem(storageKey));
  } catch {
    return EXCEL_MONITORING_EXPORT_MODE.FULL;
  }
}

export function useExcelExportMode(projectId) {
  const storageKey = useMemo(
    () =>
      projectId ? STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE(projectId) : null,
    [projectId],
  );
  const [revision, setRevision] = useState(0);
  const monitoringExportMode = useMemo(
    () => readExportMode(storageKey),
    // revision forces a synchronous storage re-read after saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey, revision],
  );

  const setMonitoringExportMode = useCallback(
    (nextMode) => {
      if (!storageKey) return;
      localStorage.setItem(
        storageKey,
        normalizeExcelMonitoringExportMode(nextMode),
      );
      setRevision((value) => value + 1);
    },
    [storageKey],
  );

  return { monitoringExportMode, setMonitoringExportMode };
}
