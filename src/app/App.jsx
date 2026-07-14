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

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { logger } from "@/utils/logger";
import { STATUS } from "@/utils/status";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import { NEARBY_RADIUS_M } from "@/pages/DataBase/hooks/useDataBaseFilters";

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
    coords,
    geoError,
    geoLoading,
  } = useAppState();

  const [sharedSearch, setSharedSearch] = useState("");
  const [sharedStatusFilter, setSharedStatusFilter] = useState([]);
  const [sharedPriorityFilter, setSharedPriorityFilter] = useState([]);
  const [sharedNearbyFilter, setSharedNearbyFilter] = useState(false);
  const [sharedNearbyRadius, setSharedNearbyRadius] = useState(NEARBY_RADIUS_M);
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
      nearbyFilter: sharedNearbyFilter,
      setNearbyFilter: setSharedNearbyFilter,
      nearbyRadius: sharedNearbyRadius,
      setNearbyRadius: setSharedNearbyRadius,
    }),
    [
      sharedSearch,
      sharedStatusFilter,
      sharedPriorityFilter,
      sharedNearbyFilter,
      sharedNearbyRadius,
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
  } = useProject();

  /* =========================
     PROJECT-AWARE DATA
  ========================= */
  const { data, save, clear, dataLoaded, dataProjectId } = useProjectData();

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

  // Сбрасываем флаг при смене проекта, чтобы GC запустился снова
  useEffect(() => {
    gcRanRef.current = false;
  }, [activeProject?.id]);

  // Запускаем GC один раз после загрузки данных текущего проекта
  useEffect(() => {
    if (!dataLoaded) return;
    if (dataProjectId !== (activeProject?.id ?? null)) return;
    if (gcRanRef.current) return;
    gcRanRef.current = true;
    gcOrphanedPhotos(data).catch((err) => logger.warn("Photo GC error:", err));
  }, [data, gcOrphanedPhotos, dataLoaded, dataProjectId, activeProject?.id]);

  /* =========================
     ONE-TIME MIGRATION
  ========================= */
  useEffect(() => {
    const cleaned = cleanupLegacyLeaks();
    if (cleaned) {
      clear();
      setPage("");
    }
  }, [clear, setPage]);

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
      savePhotoRef,
      saveRef,
      activeProjectIdRef,
      photoReadyRef,
    }),
    [addProject, removeProject],
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [overwriteProject, stableImportCtx],
  );

  const handleCreateExcelCopy = useCallback(
    async ({ name, type, leaks, monitoringRound }) => {
      const newProject = addProject(name, type);
      if (!newProject) {
        throw new Error("Не удалось создать проект");
      }

      await waitForRefValue(activeProjectIdRef, newProject.id);
      const { persistExcelImportPhotos } =
        await import("@/services/excelImportService");
      const withPhotos = await persistExcelImportPhotos(
        leaks,
        savePhotoRef.current,
      );
      await saveRef.current(withPhotos);
      if (monitoringRound) saveMonitoringRound(newProject.id, monitoringRound);
      return { project: newProject, leakCount: withPhotos.length };
    },
    [addProject],
  );

  const handleSetupImportExcel = useCallback(
    async (file, { name, type }) => {
      const { parseExcelImportFile } =
        await import("@/services/excelImportService");
      const result = await parseExcelImportFile(file, {
        projectType: type || "upstream",
      });
      if (!result.leaks.length) {
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
          {!dataLoaded && <AppLoader />}

          {dataLoaded && page === "" && (
            <MainPage
              setPage={setPage}
              data={data}
              setData={save}
              onMonitorLeak={requestMonitoring}
              userProfile={userProfile}
            />
          )}

          {dataLoaded && page === "add" && (
            <AddLeak
              data={data}
              setData={save}
              coords={coords}
              setPage={setPage}
              prevPage={prevPage}
              userProfile={userProfile}
            />
          )}

          {dataLoaded && page === "settings" && (
            <Settings
              setPage={setPage}
              prevPage={prevPage}
              data={data}
              setData={save}
              clearDatabase={clear}
              onImportZip={handleImportZip}
              onImportIntoExisting={handleImportIntoExisting}
              onCreateExcelCopy={handleCreateExcelCopy}
            />
          )}

          {dataLoaded && page === "db" && (
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

          {dataLoaded && page === "monitoring" && (
            <Monitoring
              data={data}
              setData={save}
              coords={coords}
              sharedFilters={sharedFilters}
              requestedLeakId={requestedMonitoringLeakId}
              requestedLeakIds={requestedMonitoringLeakIds}
              onRequestedLeakConsumed={() => setRequestedMonitoringLeakId(null)}
              onRequestedLeaksConsumed={() => setRequestedMonitoringLeakIds([])}
              userProfile={userProfile}
            />
          )}

          {dataLoaded && page === "map" && (
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
