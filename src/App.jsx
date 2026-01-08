import { useState, useEffect, useCallback, useRef } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { normalizeSynonyms } from "./utils/normalizeSynonyms";
import { normalizeNumberWords } from "./utils/normalizeNumberWords";
import { normalizeEquipment } from "./utils/normalizeEquipment";
import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";

import "./index.css";
import { parseVoiceText } from "./utils/parseVoiceText";

const STORAGE_KEY = "leaks_database_v1";

export default function App() {
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const [voiceData, setVoiceData] = useState(null);
  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  /* =========================
     VOICE INPUT
  ========================= */
  const recognitionBusyRef = useRef(false);

  const handleVoiceText = (text) => {
    const normalizedText = normalizeNumberWords(text);
    const parsed = parseVoiceText(normalizedText);
    const data = normalizeSynonyms(parsed);

    if (data.component) {
      const r = normalizeEquipment(data.component);
      data.component = r.value;
      if (r.type) data.component_type = r.type;
    }

    if (data.object) {
      const r = normalizeEquipment(data.object);
      data.object = r.value;
      if (r.type) data.object_type = r.type;
    }

    setVoiceData(data);
    setPage("add");
  };

  const startVoiceInput = async () => {
    if (recognitionBusyRef.current) return;

    try {
      const perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== "granted") {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== "granted") return;
      }

      recognitionBusyRef.current = true;
      setIsRecording(true);

      const result = await SpeechRecognition.start({
        language: "ru-RU",
        partialResults: false,
        popup: false,
      });

      // 🔑 ВОТ ЭТОТ БЛОК — КЛЮЧ
      if (result?.matches?.[0]) {
        handleVoiceText(result.matches[0]);
      }
    } catch (e) {
      console.error("Speech start error:", e);
      recognitionBusyRef.current = false;
      setIsRecording(false);
    }
  };

  const stopVoiceInput = async () => {
    if (!recognitionBusyRef.current) return;

    try {
      const result = await SpeechRecognition.stop();

      if (result?.matches?.[0]) {
        handleVoiceText(result.matches[0]);
      }
    } catch (e) {
      console.error("Speech stop error:", e);
    } finally {
      recognitionBusyRef.current = false;
      setIsRecording(false);
    }
  };

  /* =========================
     LOAD STORAGE
  ========================= */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        console.error("Ошибка чтения localStorage", e);
      }
    }
  }, []);

  /* =========================
     GEOLOCATION
  ========================= */
  useEffect(() => {
    const getLocation = async () => {
      /* ===== WEB ===== */
      if (!Capacitor.isNativePlatform()) {
        if (!navigator.geolocation) {
          setError("Браузер не поддерживает геолокацию");
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCoords({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            });
          },
          (err) => {
            setError(err.message || "Ошибка геолокации (WEB)");
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
          }
        );

        return;
      }

      /* ===== MOBILE (CAPACITOR) ===== */
      try {
        const perm = await Geolocation.requestPermissions();

        if (perm.location !== "granted") {
          setError("Нет разрешения на геолокацию");
          return;
        }

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
        });

        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      } catch (err) {
        setError(err.message || "Ошибка геолокации (MOBILE)");
      }
    };

    getLocation();
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
          {error ? (
            <b>Локация 📍 {error}</b>
          ) : coords.lat && coords.lon ? (
            <b>
              Локация 📍 X/Y: {coords.lat.toFixed(6)} / {coords.lon.toFixed(6)}
            </b>
          ) : (
            <b>Локация 📍 Определение…</b>
          )}
        </div>

        <button onClick={() => setPage("add")}>➕ Добавить утечку</button>
        <button onClick={() => setPage("db")}>📄 База данных</button>
        <button onClick={() => setPage("test")}>📄 Test</button>

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
          isRecording={isRecording}
        />
      )}{" "}
      {page === "db" && <DataBase data={data} setData={setData} />}
    </div>
  );
}
