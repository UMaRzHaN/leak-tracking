import s from "../index.scss";
import { useEffect } from "react";

import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";

import AddLeak from "../pages/AddLeak";
import DataBase from "../pages/DataBase";
import MapPage from "../pages/MapPage";
import MainPage from "../pages/MainPage";
import Settings from "../pages/Settings/Settings";

import { useProject } from "./settings/ProjectContext";
import { useProjectData } from "./hooks/useProjectData";
import { useVoiceControl } from "./hooks/useVoiceControl";
import { useAppState } from "./hooks/useAppState";

import { cleanupLegacyLeaks } from "./migrations/cleanupLegacyLeaks";
import { useLeakForm } from "../components/LeakForm/hooks/useLeakForm";

export default function App() {
  /* =========================
     GLOBAL APP STATE (UI)
  ========================= */
  const {
    page,
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
  const { project } = useProject();

  /* =========================
     PROJECT-AWARE DATA
  ========================= */
  const { data, save, clear } = useProjectData(project);

  /* =========================
     VOICE
  ========================= */
  const { voiceData, clearVoiceData, startVoiceInput, stopVoiceInput } =
    useVoiceControl(setPage);
  const { form, errors, handle, setErrors, setForm } = useLeakForm();

  /* =========================
     ONE-TIME MIGRATION
  ========================= */
  useEffect(() => {
    const cleaned = cleanupLegacyLeaks();

    if (cleaned) {
      console.log("🧹 Legacy base64 leaks removed");
      clear();
      setPage("");
    }
  }, [clear, setPage]);

  const hideLayout = page === "add" || page === "settings";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.app}>
      {!hideLayout && (
        <Header
          geoLoading={geoLoading}
          coords={coords}
          geoError={geoError}
          setPage={setPage}
        />
      )}

      <div className={s.pages}>
        {page === "" && (
          <MainPage
            setGpsEnabled={setGpsEnabled}
            setPage={setPage}
            gpsEnabled={gpsEnabled}
            data={data}
            setData={save}
          />
        )}

        {page === "add" && (
          <AddLeak
            data={data}
            setData={save}
            coords={coords}
            voiceData={voiceData}
            clearVoiceData={clearVoiceData}
            startVoiceInput={startVoiceInput}
            stopVoiceInput={stopVoiceInput}
            setPage={setPage}
            form={form}
            errors={errors}
            handle={handle}
            setErrors={setErrors}
            setForm={setForm}
          />
        )}

        {page === "db" && (
          <DataBase
            data={data}
            setData={save}
            coords={coords}
            clearDatabase={clear}
          />
        )}

        {page === "map" && <MapPage leaks={data} coords={coords} />}

        {page === "settings" && <Settings setPage={setPage} />}
      </div>

      {!hideLayout && <Footer page={page} setPage={setPage} />}
    </div>
  );
}
