import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../project/ProjectContext";
import { useProjectData } from "./useProjectData";
import { useAppState } from "./useAppState";
import { useUserProfile } from "./useUserProfile";
import { useLanguage } from "./useLanguage";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { STATUS } from "@/utils/status";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import { NEARBY_RADIUS_M } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { MONITORING_FILTER } from "@/pages/Monitoring/monitoringDomain";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PROJECTS } from "@/configs/projects";
import {
  readProjectFilters,
  writeProjectFilters,
} from "@/app/project/projectFilters";
import { writeProjectSettings } from "@/app/project/projectSettings";
import { writeProjectSyncState } from "@/services/projectSyncState";
import { rollbackImportedProject } from "@/services/projectCleanup";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { useDeferredPhotoGc } from "./useDeferredPhotoGc";

function waitForRefValue(ref, expectedValue, timeoutMs = 2000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (ref.current === expectedValue) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Не удалось дождаться переключения проекта"));
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}

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

  const [sharedSearch, setSharedSearch] = useState("");
  const { lang } = useLanguage();
  const importingDataLabel =
    lang === "ru"
      ? "Импорт данных, подождите..."
      : "Importing data, please wait...";
  const [sharedStatusFilter, setSharedStatusFilter] = useState([]);
  const [sharedPriorityFilter, setSharedPriorityFilter] = useState([]);
  const [sharedMainLocationFilter, setSharedMainLocationFilter] =
    useState(null);
  const [sharedLocationFilter, setSharedLocationFilter] = useState(null);
  const [sharedNearbyFilter, setSharedNearbyFilter] = useState(false);
  const [sharedNearbyRadius, setSharedNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [sharedMonitoringFilter, setSharedMonitoringFilter] = useState(
    MONITORING_FILTER.DUE,
  );
  const [requestedMonitoringLeakId, setRequestedMonitoringLeakId] =
    useState(null);
  const [requestedMonitoringLeakIds, setRequestedMonitoringLeakIds] = useState(
    [],
  );
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const filterPersistenceProjectRef = useRef(null);
  const skipNextFilterPersistRef = useRef(false);
  const { profile: userProfile, setProfile: setUserProfile } = useUserProfile();

  const sharedFilters = useMemo(
    () => ({
      search: sharedSearch,
      setSearch: setSharedSearch,
      statusFilter: sharedStatusFilter,
      setFilter: setSharedStatusFilter,
      priorityFilter: sharedPriorityFilter,
      setPriorityFilter: setSharedPriorityFilter,
      mainLocationFilter: sharedMainLocationFilter,
      setMainLocationFilter: setSharedMainLocationFilter,
      locationFilter: sharedLocationFilter,
      setLocationFilter: setSharedLocationFilter,
      nearbyFilter: sharedNearbyFilter,
      setNearbyFilter: setSharedNearbyFilter,
      nearbyRadius: sharedNearbyRadius,
      setNearbyRadius: setSharedNearbyRadius,
      monitoringFilter: sharedMonitoringFilter,
      setMonitoringFilter: setSharedMonitoringFilter,
    }),
    [
      sharedSearch,
      sharedStatusFilter,
      sharedPriorityFilter,
      sharedMainLocationFilter,
      sharedLocationFilter,
      sharedNearbyFilter,
      sharedNearbyRadius,
      sharedMonitoringFilter,
    ],
  );

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

  useEffect(() => {
    const projectId = activeProject?.id ?? null;
    filterPersistenceProjectRef.current = projectId;
    skipNextFilterPersistRef.current = true;
    const filters = readProjectFilters(projectId);
    const locationConfig = PROJECTS[activeProject?.type]?.system?.location;
    const mainLocationFilter =
      filters.mainLocationFilter?.key === locationConfig?.main
        ? filters.mainLocationFilter
        : null;
    const locationFilter =
      filters.locationFilter?.key === locationConfig?.secondary
        ? filters.locationFilter
        : null;

    setSharedSearch(filters.search);
    setSharedStatusFilter(filters.statusFilter);
    setSharedPriorityFilter(filters.priorityFilter);
    setSharedMainLocationFilter(mainLocationFilter);
    setSharedLocationFilter(locationFilter);
    setSharedNearbyFilter(filters.nearbyFilter);
    setSharedNearbyRadius(filters.nearbyRadius);
    setSharedMonitoringFilter(filters.monitoringFilter);
  }, [activeProject?.id, activeProject?.type]);

  useEffect(() => {
    const projectId = activeProject?.id ?? null;
    if (!projectId || filterPersistenceProjectRef.current !== projectId) return;
    if (skipNextFilterPersistRef.current) {
      skipNextFilterPersistRef.current = false;
      return;
    }

    writeProjectFilters(projectId, {
      search: sharedSearch,
      statusFilter: sharedStatusFilter,
      priorityFilter: sharedPriorityFilter,
      mainLocationFilter: sharedMainLocationFilter,
      locationFilter: sharedLocationFilter,
      nearbyFilter: sharedNearbyFilter,
      nearbyRadius: sharedNearbyRadius,
      monitoringFilter: sharedMonitoringFilter,
    });
  }, [
    activeProject?.id,
    activeProject?.type,
    sharedSearch,
    sharedStatusFilter,
    sharedPriorityFilter,
    sharedMainLocationFilter,
    sharedLocationFilter,
    sharedNearbyFilter,
    sharedNearbyRadius,
    sharedMonitoringFilter,
  ]);

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
  /* =========================
     OPEN LEAKS COUNT (for Footer badge)
  ========================= */
  const openCount = useMemo(
    () => data.filter((l) => (l.status ?? STATUS.OPEN) === STATUS.OPEN).length,
    [data],
  );

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

  /** First-run (ProjectSetupScreen): supports name/type fallback when ZIP has no project.json */
  const handleSetupImportZip = useCallback(
    (file, fallback = {}) =>
      runWithImportOverlay(async () => {
        const { importProjectZip } =
          await import("@/services/projectBackupService");
        return importProjectZip(file, {
          ...stableImportCtx,
          metaFallback: fallback,
        });
      }),
    [runWithImportOverlay, stableImportCtx],
  );

  /** In-app import (Settings): always creates a new project, optional fallback for legacy ZIPs.
   *  options.overrideName forces the project name regardless of project.json (used for copies). */
  const handleImportZip = useCallback(
    (file, fallback, options = {}) =>
      runWithImportOverlay(async () => {
        const { importProjectZip } =
          await import("@/services/projectBackupService");
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
          await import("@/services/projectBackupService");
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
            await import("@/services/excelImportService");
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

  const handleSetupImportExcel = useCallback(
    async (file, { name, type }) => {
      const { parseExcelImportFile } =
        await import("@/services/excelImportService");
      const result = await parseExcelImportFile(file, {
        // Do not invent an upstream project type on the first-run screen.
        // Ordinary XLSX files are parsed with their common columns first and
        // the resulting leak fields are then used for type detection below.
        projectType: type || undefined,
      });
      if (!result.leaks.length && !result.portableArchive) {
        const error = new Error("No importable rows found in XLSX");
        error.code = "EMPTY_EXCEL";
        throw error;
      }
      let resolvedType = result.project?.type || type;
      if (!resolvedType) {
        const { detectProjectTypeFromLeaks } =
          await import("@/services/projectBackupService");
        resolvedType = detectProjectTypeFromLeaks(result.leaks);
      }
      if (!resolvedType) {
        const error = new Error("Project type is missing");
        error.code = "MISSING_PROJECT_TYPE";
        throw error;
      }
      return handleCreateExcelCopy({
        name: result.project?.name || name,
        type: resolvedType,
        leaks: result.leaks,
        monitoringRound: result.monitoringRound,
        vars: result.vars,
        settings: result.settings,
        syncId: result.project?.syncId,
        sync: result.sync,
      });
    },
    [handleCreateExcelCopy],
  );

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
    handleSetupImportZip,
    importingDataLabel,
    isConfigured,
    isImportingProject,
    lang,
    loadError,
    loadWarning,
    openCount,
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
