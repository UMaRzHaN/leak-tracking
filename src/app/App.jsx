import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@/index.scss";

import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import UserProfileSheet from "@/components/ui/UserProfileSheet/UserProfileSheet";

const Settings = lazy(() => import("@/pages/Settings/Settings"));
const ProjectSetupScreen = lazy(
  () => import("@/pages/ProjectSetup/ProjectSetupScreen"),
);

import { useProject } from "./project/ProjectContext";
import { useProjectData } from "./hooks/useProjectData";
import { useAppState } from "./hooks/useAppState";
import { useUserProfile } from "./hooks/useUserProfile";
import { useLanguage } from "./hooks/useLanguage";

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { logger } from "@/utils/logger";
import { STATUS } from "@/utils/status";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import { NEARBY_RADIUS_M } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { MONITORING_FILTER } from "@/pages/Monitoring/monitoringDomain";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { writeProjectSettings } from "@/app/project/projectSettings";
import { writeProjectSyncState } from "@/services/projectSyncState";
import { rollbackImportedProject } from "@/services/projectCleanup";

const AddLeak = lazy(() => import("@/pages/AddLeak/AddLeak"));
const MainPage = lazy(() => import("@/pages/MainPage/MainPage"));
const DataBase = lazy(() => import("@/pages/DataBase/DataBase"));
const MapPage = lazy(() => import("@/pages/MapPage/MapPage"));
const Monitoring = lazy(() => import("@/pages/Monitoring/Monitoring"));

function AppLoader({ label = "Загрузка данных" }) {
  return (
    <div className="appLoader" role="status" aria-live="polite">
      <span className="appLoaderRing" aria-hidden="true" />
      <span className="appLoaderText">{label}</span>
    </div>
  );
}

function ProjectDataLoadError({ lang, onRetry }) {
  const ru = lang === "ru";
  return (
    <section className="dataLoadError" role="alert" aria-live="assertive">
      <span className="dataLoadErrorIcon" aria-hidden="true">
        !
      </span>
      <h1>
        {ru
          ? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435"
          : "Data could not be read"}
      </h1>
      <p>
        {ru
          ? "\u0414\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430 \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u044b. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043f\u043e\u043f\u044b\u0442\u043a\u0443."
          : "The project is not treated as empty. Writes are blocked to protect existing data. Check storage and try again."}
      </p>
      <button type="button" onClick={onRetry}>
        {ru
          ? "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0447\u0442\u0435\u043d\u0438\u0435"
          : "Retry"}
      </button>
    </section>
  );
}

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

export default function App() {
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
  const [sharedStatusFilter, setSharedStatusFilter] = useState([]);
  const [sharedPriorityFilter, setSharedPriorityFilter] = useState([]);
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
  const { profile: userProfile, setProfile: setUserProfile } = useUserProfile();

  const sharedFilters = useMemo(
    () => ({
      search: sharedSearch,
      setSearch: setSharedSearch,
      statusFilter: sharedStatusFilter,
      setFilter: setSharedStatusFilter,
      priorityFilter: sharedPriorityFilter,
      setPriorityFilter: setSharedPriorityFilter,
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
  } = useProject();

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
    retryLoad,
  } = useProjectData();

  useEffect(() => {
    setSharedLocationFilter(null);
  }, [activeProject?.id]);

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
  const gcRanRef = useRef(false);
  const [isImportingProject, setIsImportingProject] = useState(false);

  // Сбрасываем флаг при смене проекта, чтобы GC запустился снова
  useEffect(() => {
    gcRanRef.current = false;
  }, [activeProject?.id]);

  // Запускаем GC один раз после загрузки данных текущего проекта
  useEffect(() => {
    if (!dataLoaded) return;
    if (dataProjectId !== (activeProject?.id ?? null)) return;
    if (loadError) return;
    if (gcRanRef.current) return;
    gcRanRef.current = true;
    gcOrphanedPhotos(dataForPhotoGc).catch((err) =>
      logger.warn("Photo GC error:", err),
    );
  }, [
    dataForPhotoGc,
    gcOrphanedPhotos,
    dataLoaded,
    loadError,
    dataProjectId,
    activeProject?.id,
  ]);
  /* =========================
     ONE-TIME MIGRATION
  ========================= */
  useEffect(() => {
    cleanupLegacyLeaks();
  }, []);

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
      setProjectSyncId,
      savePhotoRef,
      saveRef,
      activeProjectIdRef,
      photoReadyRef,
    }),
    [addProject, removeProject, setProjectSyncId],
  );

  /** First-run (ProjectSetupScreen): supports name/type fallback when ZIP has no project.json */
  const handleSetupImportZip = useCallback(
    async (file, fallback = {}) => {
      const { importProjectZip } =
        await import("@/services/projectBackupService");
      await importProjectZip(file, {
        ...stableImportCtx,
        metaFallback: fallback,
      });
      // importCtx values are stable refs — addProject is the only real dep
    },
    [stableImportCtx],
  );

  /** In-app import (Settings): always creates a new project, optional fallback for legacy ZIPs.
   *  options.overrideName forces the project name regardless of project.json (used for copies). */
  const handleImportZip = useCallback(
    async (file, fallback, options = {}) => {
      const { importProjectZip } =
        await import("@/services/projectBackupService");
      return await importProjectZip(file, {
        ...stableImportCtx,
        metaFallback: fallback,
        ...options,
      });
    },
    [stableImportCtx],
  );

  /** Import into an already-existing project (overwrite or merge). */
  const handleImportIntoExisting = useCallback(
    async (file, existingProject, mode) => {
      const { importIntoExistingProject } =
        await import("@/services/projectBackupService");
      return await importIntoExistingProject(
        file,
        { ...stableImportCtx, overwriteProject, existingProject },
        mode,
      );
      // importCtx contains only stable refs — overwriteProject is the real dep
    },
    [overwriteProject, stableImportCtx],
  );

  const handleCreateExcelCopy = useCallback(
    async ({
      name,
      type,
      leaks,
      monitoringRound,
      vars,
      settings,
      syncId,
      sync,
    }) => {
      const newProject = addProject(
        name,
        type,
        syncId ? { syncId } : undefined,
      );
      if (!newProject) {
        throw new Error("Не удалось создать проект");
      }

      setIsImportingProject(true);
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
        if (sync) await writeProjectSyncState(newProject.id, sync, withPhotos);
        if (monitoringRound)
          saveMonitoringRound(newProject.id, monitoringRound);
        return { project: newProject, leakCount: withPhotos.length };
      } catch (error) {
        await rollbackImportedProject(newProject, removeProject);
        throw error;
      } finally {
        setIsImportingProject(false);
      }
    },
    [addProject, removeProject],
  );

  const handleSetupImportExcel = useCallback(
    async (file, { name, type }) => {
      const { parseExcelImportFile } =
        await import("@/services/excelImportService");
      const result = await parseExcelImportFile(file, {
        projectType: type || undefined,
      });
      if (!type && !result.project?.type) {
        const error = new Error("Project type is missing");
        error.code = "MISSING_PROJECT_TYPE";
        throw error;
      }
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

  if (!isConfigured) {
    return (
      <Suspense fallback={<AppLoader />}>
        <ProjectSetupScreen
          onComplete={configure}
          onImportZip={handleSetupImportZip}
          onImportExcel={handleSetupImportExcel}
        />
      </Suspense>
    );
  }

  const hideLayout = page === "add" || page === "settings";
  const isListPage = page === "db" || page === "monitoring";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={`app ${isListPage ? "appList" : ""}`}>
      {!hideLayout && (
        <Header
          geoLoading={geoLoading}
          coords={coords}
          geoError={geoError}
          setPage={setPage}
          gpsEnabled={gpsEnabled}
          setGpsEnabled={setGpsEnabled}
          userProfile={userProfile}
          onUserProfileOpen={() => setUserProfileOpen(true)}
        />
      )}

      <div
        className={`pages ${page === "map" ? "pagesMap" : ""} ${
          isListPage ? "pagesList" : ""
        }`}
      >
        <Suspense fallback={<AppLoader />}>
          {(!dataLoaded || isImportingProject) && (
            <AppLoader
              label={
                isImportingProject
                  ? lang === "ru"
                    ? "Импорт данных, подождите..."
                    : "Importing data, please wait..."
                  : undefined
              }
            />
          )}

          {dataLoaded && !isImportingProject && loadError && (
            <ProjectDataLoadError lang={lang} onRetry={retryLoad} />
          )}
          {dataLoaded && !isImportingProject && !loadError && page === "" && (
            <MainPage
              setPage={setPage}
              data={data}
              setData={save}
              onMonitorLeak={requestMonitoring}
              userProfile={userProfile}
            />
          )}

          {dataLoaded && !loadError && page === "add" && (
            <AddLeak
              data={data}
              setData={save}
              coords={coords}
              setPage={setPage}
              onBack={() => goBack(prevPage)}
              userProfile={userProfile}
              projectId={activeProject?.id}
            />
          )}

          {dataLoaded && !loadError && page === "settings" && (
            <Settings
              setPage={setPage}
              onBack={() => goBack(prevPage)}
              data={data}
              setData={save}
              clearDatabase={clear}
              onImportZip={handleImportZip}
              onImportIntoExisting={handleImportIntoExisting}
              onCreateExcelCopy={handleCreateExcelCopy}
            />
          )}

          {dataLoaded && !isImportingProject && !loadError && page === "db" && (
            <DataBase
              data={data}
              setData={save}
              coords={coords}
              sharedFilters={sharedFilters}
              onMonitorLeak={requestMonitoring}
              onMonitorLeaks={requestMonitoringQueue}
              userProfile={userProfile}
            />
          )}

          {dataLoaded &&
            !isImportingProject &&
            !loadError &&
            page === "monitoring" && (
              <Monitoring
                data={data}
                setData={save}
                coords={coords}
                sharedFilters={sharedFilters}
                requestedLeakId={requestedMonitoringLeakId}
                requestedLeakIds={requestedMonitoringLeakIds}
                onRequestedLeakConsumed={() =>
                  setRequestedMonitoringLeakId(null)
                }
                onRequestedLeaksConsumed={() =>
                  setRequestedMonitoringLeakIds([])
                }
                userProfile={userProfile}
              />
            )}

          {dataLoaded &&
            !isImportingProject &&
            !loadError &&
            page === "map" && (
              <MapPage
                leaks={data}
                coords={coords}
                gpsEnabled={gpsEnabled}
                sharedFilters={sharedFilters}
              />
            )}
        </Suspense>
      </div>

      {!hideLayout && (
        <Footer page={page} setPage={setPage} openCount={openCount} />
      )}

      <UserProfileSheet
        open={userProfileOpen}
        profile={userProfile}
        onSave={setUserProfile}
        onClose={() => setUserProfileOpen(false)}
      />
    </div>
  );
}
