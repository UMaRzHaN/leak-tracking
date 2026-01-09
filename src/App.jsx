import { useState, useEffect, useCallback } from "react";

import { useGeolocation } from "./hooks/useGeolocation";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

import { handleVoiceText } from "./utils/handleVoiceText";

import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";

import "./index.css";

const STORAGE_KEY = "leaks_database_v1";

export default function App() {
  /* =========================
     STATE
  ========================= */
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [voiceData, setVoiceData] = useState(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  /* =========================
     GEOLOCATION (HOOK)
  ========================= */
  const { coords, error: geoError, loading: geoLoading } = useGeolocation();

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
      <div className="header">Журнал утечек газа</div>

      <div className="card">
        <div style={{ color: "#546e7a" }}>
          {geoError ? (
            <b>Локация 📍 {geoError}</b>
          ) : geoLoading ? (
            <b>Локация 📍 Определение…</b>
          ) : coords.lat && coords.lon ? (
            <b>
              Локация 📍 X/Y: {coords.lat.toFixed(6)} / {coords.lon.toFixed(6)}
            </b>
          ) : (
            <b>Локация 📍 Нет данных</b>
          )}
        </div>

        <button onClick={() => setPage("add")}>➕ Добавить утечку</button>
        <button onClick={() => setPage("db")}>📄 База данных</button>

        {data.length > 0 && (
          <button
            onClick={clearDatabase}
            style={{
              marginTop: 8,
              background: "#ffebee",
              color: "#b71c1c",
              border: "1px solid #ffcdd2",
            }}
          >
            🗑 Очистить базу данных
          </button>
        )}
      </div>

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
        <DataBase data={data} setData={setData} coords={coords} />
      )}
    </div>
  );
}
