import { useState, useEffect, useCallback } from "react";

import { useGeolocation } from "./hooks/useGeolocation";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

import { handleVoiceText } from "./utils/handleVoiceText";

import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import MapPage from "./pages/MapPage";

import "./index.css";
import { Directory, Filesystem } from "@capacitor/filesystem";
import MainPage from "./pages/MainPage";

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
    }
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
  return (
    <div className="app">
      <header className="header">
        Журнал утечек газа
        <div style={{ color: "gray", marginTop: 10 }}>
          {geoError ? (
            <b>Локация 📍 {geoError}</b>
          ) : geoLoading ? (
            <b>Локация 📍 Определение…</b>
          ) : coords.lat && coords.lon ? (
            <b>
              Локация 📍 {coords.lat.toFixed(6)} / {coords.lon.toFixed(6)}
            </b>
          ) : (
            <b>Локация 📍 Нет данных</b>
          )}
        </div>
      </header>

      {page === "" && (
        <MainPage
          setGpsEnabled={setGpsEnabled}
          setPage={setPage}
          gpsEnabled={gpsEnabled}
          data={data}
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
      <footer className="bottom-nav">
        <button
          className={`nav-item ${page === "map" ? "active" : ""}`}
          onClick={() => setPage("map")}
        >
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Map</span>
        </button>
        <button
          className={`nav-item ${page === "" ? "active" : ""}`}
          onClick={() => setPage("")}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>

        <button
          className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => setPage("settings")}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Settings</span>
        </button>
      </footer>
    </div>
  );
}
