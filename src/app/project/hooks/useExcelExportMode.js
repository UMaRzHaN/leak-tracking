import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  PROJECT_SETTINGS_UPDATED_EVENT,
  emitSettingsUpdated,
  touchProjectSettings,
} from "@/app/project/projectSettings";
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

/**
 * Режим выгрузки листа с обходами: все записи или последняя в обходе.
 * По умолчанию — лист мониторинга; `keyOf` выбирает другой лист.
 *
 * @param {string|null} projectId
 * @param {(projectId: string) => string} [keyOf]
 */
export function useExcelExportMode(
  projectId,
  keyOf = STORAGE_KEYS.PROJECT_EXCEL_EXPORT_MODE,
) {
  const storageKey = useMemo(
    () => (projectId ? keyOf(projectId) : null),
    [projectId, keyOf],
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!projectId || typeof window === "undefined") return undefined;
    const handleSettingsUpdated = (event) => {
      if (event.detail?.projectId === projectId) {
        setRevision((value) => value + 1);
      }
    };
    window.addEventListener(
      PROJECT_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated,
    );
    return () =>
      window.removeEventListener(
        PROJECT_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated,
      );
  }, [projectId]);

  const monitoringExportMode = useMemo(() => {
    void revision;
    return readExportMode(storageKey);
  }, [storageKey, revision]);

  const setMonitoringExportMode = useCallback(
    (nextMode) => {
      if (!storageKey) return;
      localStorage.setItem(
        storageKey,
        normalizeExcelMonitoringExportMode(nextMode),
      );
      touchProjectSettings(projectId);
      setRevision((value) => value + 1);
      // Режим читают и другие копии хука на том же экране — подпись листа и
      // сама выгрузка; без события они собрали бы файл в прежнем режиме.
      if (projectId) emitSettingsUpdated(projectId);
    },
    [projectId, storageKey],
  );

  return {
    mode: monitoringExportMode,
    setMode: setMonitoringExportMode,
    monitoringExportMode,
    setMonitoringExportMode,
  };
}
