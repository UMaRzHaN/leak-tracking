import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../project/ProjectContext";
import { useProjectData } from "./useProjectData";
import { useAppState } from "./useAppState";
import { useUserProfile } from "./useUserProfile";
import { useLanguage } from "./useLanguage";
import { useSharedFilters } from "./useSharedFilters";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { writeProjectSettings } from "@/app/project/projectSettings";
import { writeProjectSyncState } from "@/services/sync/projectSyncState";
import { rollbackImportedProject } from "@/services/backup/projectCleanup";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { useDeferredPhotoGc } from "./useDeferredPhotoGc";
import { useSetupImports } from "./useSetupImports";
import { waitForRefValue } from "./waitForProjectSwitch";

export function useAppBootstrap() {
  /* =========================
     GLOBAL APP STATE (UI)
  ========================= */
  const {
    page,
    prevPage,
    setPage,
    gpsEnabled,
    setGpsEnabled,
    goBack,
    coords,
    geoError,
    geoLoading,
  } = useAppState();

  const { t } = useLanguage();
  const importingDataLabel = t("app.importingData");
  const [requestedMonitoringLeakId, setRequestedMonitoringLeakId] =
    useState(null);
  const [requestedMonitoringLeakIds, setRequestedMonitoringLeakIds] = useState(
    [],
  );
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const { profile: userProfile, setProfile: setUserProfile } = useUserProfile();

  /* =========================
     PROJECT CONTEXT
  ========================= */
  const {
    isConfigured,
    configure,
    addProject,
    activeProject,
    overwriteProject,
    removeProject,
    setProjectSyncId,
    replaceProjectSyncId,
    restoreProjectSnapshot,
  } = useProject();
  const { clearForm } = useLeakFormContext();

  /* =========================
     PROJECT-AWARE DATA
  ========================= */
  const {
    data,
    dataForPhotoGc,
    save,
    clear,
    dataLoaded,
    dataProjectId,
    loadError,
    loadWarning,
    retryLoad,
  } = useProjectData();

  const sharedFilters = useSharedFilters({
    projectId: activeProject?.id ?? null,
    projectType: activeProject?.type,
  });

  /* =========================
     PHOTO GC
  ========================= */
  const { gcOrphanedPhotos, savePhoto, ready: photoReady } = usePhotoStorage();

  /* Refs для async import-handler — актуальны даже после ре-рендеров */
  const saveRef = useRef(save);
  const savePhotoRef = useRef(savePhoto);
  const photoReadyRef = useRef(photoReady);
  const activeProjectIdRef = useRef(activeProject?.id ?? null);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    savePhotoRef.current = savePhoto;
  }, [savePhoto]);
  useEffect(() => {
    photoReadyRef.current = photoReady;
  }, [photoReady]);
  useEffect(() => {
    activeProjectIdRef.current = activeProject?.id ?? null;
  }, [activeProject?.id]);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const [photoGcResumeRevision, setPhotoGcResumeRevision] = useState(0);
  const importOperationCountRef = useRef(0);
  const runWithImportOverlay = useCallback(async (operation) => {
    importOperationCountRef.current += 1;
    setIsImportingProject(true);
    try {
      return await operation();
    } finally {
      importOperationCountRef.current = Math.max(
        0,
        importOperationCountRef.current - 1,
      );
      if (importOperationCountRef.current === 0) {
        setIsImportingProject(false);
        setPhotoGcResumeRevision((revision) => revision + 1);
      }
    }
  }, []);
  const isPhotoGcSuspended = useCallback(
    () => importOperationCountRef.current > 0,
    [],
  );

  useDeferredPhotoGc({
    activeProjectId: activeProject?.id ?? null,
    dataForPhotoGc,
    dataLoaded,
    dataProjectId,
    loadError,
    gcOrphanedPhotos,
    suspended: isImportingProject,
    isSuspended: isPhotoGcSuspended,
    resumeKey: photoGcResumeRevision,
  });
  const requestMonitoring = useCallback(
    (leak) => {
      setRequestedMonitoringLeakId(leak?.id ?? null);
      setRequestedMonitoringLeakIds([]);
      setPage("monitoring");
    },
    [setPage],
  );

  const requestMonitoringQueue = useCallback(
    (leaks) => {
      const ids = Array.isArray(leaks)
        ? leaks.map((leak) => leak?.id).filter((id) => id != null)
        : [];
      if (ids.length === 0) return;
      setRequestedMonitoringLeakId(null);
      setRequestedMonitoringLeakIds(ids);
      setPage("monitoring");
    },
    [setPage],
  );

  /* =========================
     IMPORT ZIP — shared context for all entry points
  ========================= */
  const stableImportCtx = useMemo(
    () => ({
      addProject,
      removeProject,
      overwriteProject,
      setProjectSyncId,
      replaceProjectSyncId,
      restoreProjectSnapshot,
      savePhotoRef,
      saveRef,
      activeProjectIdRef,
      photoReadyRef,
    }),
    [
      addProject,
      overwriteProject,
      removeProject,
      replaceProjectSyncId,
      restoreProjectSnapshot,
      setProjectSyncId,
    ],
  );

  /** In-app import (Settings): always creates a new project, optional fallback for legacy ZIPs.
   *  options.overrideName forces the project name regardless of project.json (used for copies). */
  const handleImportZip = useCallback(
    (file, fallback, options = {}) =>
      runWithImportOverlay(async () => {
        const { importProjectZip } =
          await import("@/services/backup/projectBackupService");
        const result = await importProjectZip(file, {
          ...stableImportCtx,
          metaFallback: fallback,
          ...options,
        });
        clearForm();
        return result;
      }),
    [clearForm, runWithImportOverlay, stableImportCtx],
  );

  /** Import into an already-existing project (overwrite or merge). */
  const handleImportIntoExisting = useCallback(
    (file, existingProject, mode) =>
      runWithImportOverlay(async () => {
        const previousProjectId = activeProjectIdRef.current;
        const { importIntoExistingProject } =
          await import("@/services/backup/projectBackupService");
        const result = await importIntoExistingProject(
          file,
          { ...stableImportCtx, overwriteProject, existingProject },
          mode,
        );
        if (existingProject?.id && existingProject.id !== previousProjectId) {
          clearForm();
        }
        return result;
      }),
    [clearForm, overwriteProject, runWithImportOverlay, stableImportCtx],
  );

  const handleCreateExcelCopy = useCallback(
    (payload) =>
      runWithImportOverlay(async () => {
        const {
          name,
          type,
          leaks,
          monitoringRound,
          vars,
          settings,
          syncId,
          sync,
        } = payload;
        const previousProjectId = activeProjectIdRef.current;
        const newProject = addProject(
          name,
          type,
          syncId ? { syncId } : undefined,
        );
        if (!newProject) {
          throw new Error("Не удалось создать проект");
        }

        try {
          await waitForRefValue(activeProjectIdRef, newProject.id);
          if (vars) {
            localStorage.setItem(
              STORAGE_KEYS.PROJECT_VARS(newProject.id),
              JSON.stringify(vars),
            );
          }
          if (settings) writeProjectSettings(newProject.id, settings);
          const { persistExcelImportPhotos } =
            await import("@/services/import/excelImportService");
          const withPhotos = await persistExcelImportPhotos(
            leaks,
            savePhotoRef.current,
          );
          await saveRef.current(withPhotos);
          if (sync)
            await writeProjectSyncState(newProject.id, sync, withPhotos);
          if (monitoringRound)
            saveMonitoringRound(newProject.id, monitoringRound);
          clearForm();
          return { project: newProject, leakCount: withPhotos.length };
        } catch (error) {
          try {
            try {
              const rollback = await rollbackImportedProject(
                newProject,
                removeProject,
              );
              if (!rollback.cleanupComplete) {
                error.rollbackCleanupError = rollback.cleanupError;
              }
            } catch (rollbackError) {
              error.rollbackError = rollbackError;
            }
          } finally {
            if (previousProjectId) overwriteProject(previousProjectId);
          }
          throw error;
        }
      }),
    [
      addProject,
      clearForm,
      overwriteProject,
      removeProject,
      runWithImportOverlay,
    ],
  );

  const {
    handleSetupImportZip,
    handleSetupImportInventory,
    handleSetupImportExcel,
  } = useSetupImports({
    runWithImportOverlay,
    stableImportCtx,
    activeProjectIdRef,
    saveRef,
    addProject,
    removeProject,
    overwriteProject,
    clearForm,
    handleCreateExcelCopy,
  });

  const bootstrapStatus = !isConfigured
    ? "setup"
    : !dataLoaded
      ? "loading"
      : loadError
        ? "error"
        : "ready";

  return {
    activeProject,
    bootstrapStatus,
    clear,
    configure,
    coords,
    data,
    dataLoaded,
    geoError,
    geoLoading,
    goBack,
    gpsEnabled,
    handleCreateExcelCopy,
    handleImportIntoExisting,
    handleImportZip,
    handleSetupImportExcel,
    handleSetupImportInventory,
    handleSetupImportZip,
    importingDataLabel,
    isConfigured,
    isImportingProject,
    loadError,
    loadWarning,
    page,
    prevPage,
    requestMonitoring,
    requestMonitoringQueue,
    requestedMonitoringLeakId,
    requestedMonitoringLeakIds,
    retryLoad,
    save,
    setGpsEnabled,
    setPage,
    setRequestedMonitoringLeakId,
    setRequestedMonitoringLeakIds,
    setUserProfile,
    setUserProfileOpen,
    sharedFilters,
    userProfile,
    userProfileOpen,
  };
}
