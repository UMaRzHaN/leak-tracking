import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import "@/index.scss";

import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";

const Settings = lazy(() => import("@/pages/Settings/Settings"));
const ProjectSetupScreen = lazy(
  () => import("@/pages/ProjectSetup/ProjectSetupScreen"),
);

import { useProject } from "./project/ProjectContext";
import { useProjectData } from "./hooks/useProjectData";
import { useAppState } from "./hooks/useAppState";

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { logger } from "@/utils/logger";
import { STATUS } from "@/utils/status";

const AddLeak = lazy(() => import("@/pages/AddLeak/AddLeak"));
const MainPage = lazy(() => import("@/pages/MainPage/MainPage"));
const DataBase = lazy(() => import("@/pages/DataBase/DataBase"));
const MapPage = lazy(() => import("@/pages/MapPage/MapPage"));

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

  if (!isConfigured) {
    return (
      <Suspense fallback={null}>
        <ProjectSetupScreen
          onComplete={configure}
          onImportZip={handleSetupImportZip}
        />
      </Suspense>
    );
  }

  const hideLayout = page === "add" || page === "settings";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="app">
      {!hideLayout && (
        <Header
          geoLoading={geoLoading}
          coords={coords}
          geoError={geoError}
          setPage={setPage}
          gpsEnabled={gpsEnabled}
          setGpsEnabled={setGpsEnabled}
        />
      )}

      <div className="pages">
        <Suspense fallback={null}>
          {page === "" && (
            <MainPage setPage={setPage} data={data} setData={save} />
          )}

          {page === "add" && (
            <AddLeak
              data={data}
              setData={save}
              coords={coords}
              setPage={setPage}
              prevPage={prevPage}
            />
          )}

          {page === "settings" && (
            <Settings
              setPage={setPage}
              prevPage={prevPage}
              clearDatabase={clear}
              onImportZip={handleImportZip}
              onImportIntoExisting={handleImportIntoExisting}
            />
          )}

          {page === "db" && (
            <DataBase data={data} setData={save} coords={coords} />
          )}

          {page === "map" && <MapPage leaks={data} coords={coords} />}
        </Suspense>
      </div>

      {!hideLayout && (
        <Footer page={page} setPage={setPage} openCount={openCount} />
      )}
    </div>
  );
}
