import s from "../index.scss";
import { useEffect, useMemo } from "react";

import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
// import OfflineBanner from "../components/OfflineBanner/OfflineBanner";

import AddLeak from "../pages/AddLeak/AddLeak";
import DataBase from "../pages/DataBase/DataBase";
import MapPage from "../pages/MapPage/MapPage";
import MainPage from "../pages/MainPage/MainPage";
import Settings from "../pages/Settings/Settings";
import ProjectSetupScreen from "../pages/ProjectSetup/ProjectSetupScreen";

import { useProject } from "./settings/ProjectContext";
import { useProjectData } from "./hooks/useProjectData";
import { useAppState } from "./hooks/useAppState";

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { useLeakForm } from "../components/LeakForm/hooks/useLeakForm";
import { STATUS } from "../utils/status";

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
  const { isConfigured, configure } = useProject();

  /* =========================
     PROJECT-AWARE DATA
  ========================= */
  const { data, save, clear } = useProjectData();

  /* =========================
     VOICE
  ========================= */
  const { form, errors, handle, setErrors, setForm, clearForm } = useLeakForm();

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
     FIRST LAUNCH SETUP
  ========================= */
  if (!isConfigured) {
    return <ProjectSetupScreen onComplete={configure} />;
  }

  const hideLayout = page === "add" || page === "settings";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.app}>
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

      <div className={s.pages}>
        {page === "" && (
          <MainPage setPage={setPage} data={data} setData={save} />
        )}

        {page === "add" && (
          <AddLeak
            data={data}
            setData={save}
            coords={coords}
            setPage={setPage}
            form={form}
            errors={errors}
            handle={handle}
            setErrors={setErrors}
            setForm={setForm}
          />
        )}

        {page === "db" && (
          <DataBase data={data} setData={save} coords={coords} />
        )}

        {page === "map" && <MapPage leaks={data} coords={coords} />}

        {page === "settings" && (
          <Settings
            setPage={setPage}
            prevPage={prevPage}
            clearForm={clearForm}
            clearDatabase={clear}
          />
        )}
      </div>

      {!hideLayout && (
        <Footer page={page} setPage={setPage} openCount={openCount} />
      )}
    </div>
  );
}
