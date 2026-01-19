import { useState, useEffect, useCallback } from "react";

import { useGeolocation } from "./hooks/useGeolocation";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

import { handleVoiceText } from "./utils/handleVoiceText";

import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import MapPage from "./pages/MapPage";

import s from "./index.scss";
import { Directory, Filesystem } from "@capacitor/filesystem";
import MainPage from "./pages/MainPage";
import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";

const STORAGE_KEY = "leaks_database_v1";

export default function App() {
  /* =========================
     STATE
  ========================= */
  const [page, setPage] = useState("");
  const [data, setData] = useState([]);

  const [voiceData, setVoiceData] = useState(null);
  const [gpsEnabled, setGpsEnabled] = useState(true);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  /* =========================
     GEOLOCATION (HOOK)
  ========================= */
  const {
    coords,
    error: geoError,
    loading: geoLoading,
  } = useGeolocation(gpsEnabled);

  /* =========================
     SPEECH RECOGNITION (HOOK)
  ========================= */
  const { start: startVoiceInput, stop: stopVoiceInput } = useSpeechRecognition(
    (text) => {
      handleVoiceText(text, setVoiceData, setPage);
    },
  );

  /* =========================
     LOAD STORAGE
  ========================= */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      setData(JSON.parse(saved));
    } catch (e) {
      console.error("Ошибка чтения localStorage", e);
    }
  }, []);
  useEffect(() => {
    Filesystem.mkdir({
      path: "LeakReports/photos",
      Directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});
  }, []);
  /* =========================
     CLEAR DATABASE
  ========================= */
  const clearDatabase = () => {
    if (!window.confirm("Удалить ВСЮ базу данных?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setData([]);
  };

  /* =========================
     UI
  ========================= */
  const hideLayout = page === "add";
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
      <div className={s.page}>
        {page === "" && (
          <MainPage
            setGpsEnabled={setGpsEnabled}
            setPage={setPage}
            gpsEnabled={gpsEnabled}
            data={data}
            setData={setData}
          />
        )}
        {page === "add" && (
          <AddLeak
            data={data}
            setData={setData}
            coords={coords}
            voiceData={voiceData}
            clearVoiceData={clearVoiceData}
            startVoiceInput={startVoiceInput}
            stopVoiceInput={stopVoiceInput}
            setPage={setPage}
          />
        )}

        {page === "db" && (
          <DataBase
            data={data}
            setData={setData}
            coords={coords}
            clearDatabase={clearDatabase}
          />
        )}
        {page === "map" && <MapPage leaks={data} />}
      </div>

      {!hideLayout && <Footer page={page} setPage={setPage} />}
    </div>
  );
}
