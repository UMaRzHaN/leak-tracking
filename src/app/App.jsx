import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import "../index.scss";

import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
// import OfflineBanner from "../components/OfflineBanner/OfflineBanner";

import AddLeak from "../pages/AddLeak/AddLeak";
import MainPage from "../pages/MainPage/MainPage";
import Settings from "../pages/Settings/Settings";
import ProjectSetupScreen from "../pages/ProjectSetup/ProjectSetupScreen";

import { useProject } from "./settings/ProjectContext";
import { useProjectData } from "./hooks/useProjectData";
import { useAppState } from "./hooks/useAppState";
import { STORAGE_KEYS } from "./settings/storageKeys";

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { usePhotoStorage } from "../hooks/usePhotoStorage";
import { peekBackupZip, importBackupZip } from "../services/export/backup";
import { STATUS } from "../utils/status";

const DataBase = lazy(() => import("../pages/DataBase/DataBase"));
const MapPage  = lazy(() => import("../pages/MapPage/MapPage"));

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
     ONLINE / OFFLINE
  ========================= */
  // const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  // useEffect(() => {
  //   const up   = () => setIsOnline(true);
  //   const down = () => setIsOnline(false);
  //   window.addEventListener("online",  up);
  //   window.addEventListener("offline", down);
  //   return () => {
  //     window.removeEventListener("online",  up);
  //     window.removeEventListener("offline", down);
  //   };
  // }, []);

  /* =========================
     PROJECT CONTEXT
  ========================= */
  const { isConfigured, configure, addProject, activeProject } = useProject();

  /* =========================
     PROJECT-AWARE DATA
  ========================= */
  const { data, save, clear } = useProjectData();

  /* =========================
     PHOTO GC
  ========================= */
  const { gcOrphanedPhotos, savePhoto, ready: photoReady } = usePhotoStorage();

  /* Refs для async import-handler — актуальны даже после ре-рендеров */
  const saveRef = useRef(save);
  const savePhotoRef = useRef(savePhoto);
  const photoReadyRef = useRef(photoReady);
  const activeProjectIdRef = useRef(activeProject?.id ?? null);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { savePhotoRef.current = savePhoto; }, [savePhoto]);
  useEffect(() => { photoReadyRef.current = photoReady; }, [photoReady]);
  useEffect(() => { activeProjectIdRef.current = activeProject?.id ?? null; }, [activeProject?.id]);
  const gcRanRef = useRef(false);

  // Сбрасываем флаг при смене проекта, чтобы GC запустился снова
  useEffect(() => {
    gcRanRef.current = false;
  }, [activeProject?.id]);

  // Запускаем GC один раз после загрузки данных текущего проекта
  useEffect(() => {
    if (gcRanRef.current) return;
    gcRanRef.current = true;
    gcOrphanedPhotos(data).catch((err) => console.warn("Photo GC error:", err));
  }, [data, gcOrphanedPhotos]);

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
     FIRST LAUNCH SETUP — import ZIP
  ========================= */
  const handleSetupImportZip = useCallback(async (file, fallback = {}) => {
    const peek = await peekBackupZip(file);
    const meta = peek.meta?.project;

    const projectName = meta?.name || fallback.name;
    const projectType = meta?.type || fallback.type;

    if (!projectName || !projectType) {
      throw new Error("Архив не содержит метаданных проекта. Заполните название и тип проекта в форме выше.");
    }

    const created = addProject(projectName, projectType);
    if (!created) throw new Error("Не удалось создать проект");

    // Ждём, пока React применит новый activeProject (и обновит все ref-ы)
    for (let i = 0; i < 60; i++) {
      if (activeProjectIdRef.current === created.id) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50));
    }
    if (activeProjectIdRef.current !== created.id) {
      throw new Error("Не удалось переключиться на импортируемый проект");
    }

    for (let i = 0; i < 60; i++) {
      if (photoReadyRef.current) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!photoReadyRef.current) throw new Error("Хранилище фото не готово");

    const imported = await importBackupZip(file, savePhotoRef.current);
    await saveRef.current(imported.leaks);

    if (peek.meta?.vars) {
      localStorage.setItem(STORAGE_KEYS.PROJECT_VARS(created.id), JSON.stringify(peek.meta.vars));
    }
  }, [addProject]);

  if (!isConfigured) {
    return <ProjectSetupScreen onComplete={configure} onImportZip={handleSetupImportZip} />;
  }

  const hideLayout = page === "add" || page === "settings";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="app">
      {/* {!isOnline && <OfflineBanner />} */}

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
          />
        )}

        <Suspense fallback={null}>
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
