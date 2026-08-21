import { useCallback } from "react";
import {
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import {
  readProjectSettings,
  writeProjectSettings,
} from "@/app/project/projectSettings";
import {
  readProjectSyncStateAsync,
  writeProjectSyncState,
} from "@/services/sync/projectSyncState";
import { STORAGE_KEYS } from "@/app/project/storageKeys";

/**
 * Проект вокруг импорта Excel: снять снимок, применить привезённое, откатить.
 *
 * Записи утечек — не всё, что приезжает в книге: с ней приходят переменные
 * проекта, настройки экрана, обход мониторинга и состояние синхронизации.
 * Живут они не в базе, а рядом — в localStorage и в отдельных хранилищах, и
 * транзакция импорта их не откатывает. Поэтому перед вливанием снимается
 * снимок, а если импорт не сложился, снимок раскладывается обратно.
 *
 * Отдельным хуком — потому что это законченный кусок работы с состоянием
 * проекта, а не с экраном настроек: в оркестраторе он тонул среди диалогов
 * и уведомлений.
 */
export function useExcelProjectState({
  activeProject,
  data,
  setVarsAsync,
  restoreProjectMetadata,
  restoreProjectSnapshot,
}) {
  const saveExcelMonitoringRound = useCallback(
    (round) => {
      if (round) saveMonitoringRound(activeProject?.id, round);
    },
    [activeProject?.id],
  );

  const applyExcelArchiveMetadata = useCallback(
    async (result, leaks = []) => {
      if (!result || !activeProject?.id) return;
      if (result.project) {
        restoreProjectMetadata(activeProject.id, result.project);
      }
      if (result.vars) await setVarsAsync(result.vars);
      if (result.settings) {
        writeProjectSettings(activeProject.id, result.settings);
      }
      if (result.portableArchive) {
        saveMonitoringRound(activeProject.id, result.monitoringRound ?? null);
      }
      if (result.sync) {
        await writeProjectSyncState(activeProject.id, result.sync, leaks);
      }
    },
    [activeProject?.id, restoreProjectMetadata, setVarsAsync],
  );

  const captureExcelImportSnapshot = useCallback(async () => {
    const projectId = activeProject?.id;
    if (!projectId) return null;
    return {
      project: { ...activeProject },
      varsRaw: localStorage.getItem(STORAGE_KEYS.PROJECT_VARS(projectId)),
      settings: readProjectSettings(projectId),
      monitoringRound: readMonitoringRound(projectId),
      sync: await readProjectSyncStateAsync(projectId),
    };
  }, [activeProject]);

  const restoreExcelImportSnapshot = useCallback(
    async (snapshot) => {
      const projectId = snapshot?.project?.id;
      if (!projectId) return;
      if (!restoreProjectSnapshot(projectId, snapshot.project)) {
        throw new Error("Failed to restore project metadata");
      }
      const varsKey = STORAGE_KEYS.PROJECT_VARS(projectId);
      if (snapshot.varsRaw == null) localStorage.removeItem(varsKey);
      else localStorage.setItem(varsKey, snapshot.varsRaw);
      window.dispatchEvent(
        new CustomEvent("project-vars-updated", { detail: { projectId } }),
      );
      writeProjectSettings(projectId, snapshot.settings);
      saveMonitoringRound(projectId, snapshot.monitoringRound);
      await writeProjectSyncState(projectId, snapshot.sync, data);
    },
    [data, restoreProjectSnapshot],
  );

  return {
    saveExcelMonitoringRound,
    applyExcelArchiveMetadata,
    captureExcelImportSnapshot,
    restoreExcelImportSnapshot,
  };
}
