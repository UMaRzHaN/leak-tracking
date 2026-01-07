import { useState, useEffect, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import "./index.css";
import { capitalizeFirst } from "./utils/calculations";

const STORAGE_KEY = "leaks_database_v1";
const FIELD_MARKERS =
  "умг|компрессорная станция|примечание|локация|объект|компонент|описание утечки|причина утечки|техрешение|план устранения|мтр";

const parseVoiceText = (text) => {
  const result = {};
  const normalized = text.toLowerCase().replace(",", ".");

  const patterns = [
    { key: "leak_id", regex: /бирк[аи]?\s*(\d+)/, type: "number" },
    { key: "video_id", regex: /видео\s*(\d+)/, type: "number" },
    {
      key: "leak_speed",
      regex: /скорост[ьи]?\s*(\d+(\.\d+)?)/,
      type: "number",
    },
    {
      key: "pressure",
      regex: /давлени[ея]?\s*(\d+(\.\d+)?)/,
      type: "number",
    },
    {
      key: "temperature",
      regex: /температур[аы]?\s*(-?\d+)/,
      type: "number",
    },

    // 👇 ТЕКСТОВЫЕ ПОЛЯ
    {
      key: "field",
      regex: new RegExp(`умг\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "station",
      regex: new RegExp(
        `компрессорная станци[я]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "note",
      regex: new RegExp(`примечани[ея]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "location",
      regex: new RegExp(`локаци[яи]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "object",
      regex: new RegExp(`объект\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "component",
      regex: new RegExp(`компонент[ы]?\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "leak_description",
      regex: new RegExp(
        `описание утечк[и]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "leak_cause",
      regex: new RegExp(
        `причина утечк[и]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "technological_solution",
      regex: new RegExp(`техрешени[ея]\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "repair_recommendation",
      regex: new RegExp(`план устранения\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "materials_equipment",
      regex: new RegExp(`мтр\\s*(.+?)(?=\\s+(${FIELD_MARKERS})|$)`),
      type: "string",
    },
  ];

  patterns.forEach(({ key, regex, type }) => {
    const match = normalized.match(regex);
    if (!match) return;

    result[key] =
      type === "number" ? Number(match[1]) : capitalizeFirst(match[1].trim());
  });

  return result;
};

export default function App() {
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);

  const [voiceData, setVoiceData] = useState(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  /* =========================
     VOICE INPUT
  ========================= */
  const startVoiceInput = async () => {
    /* ===== WEB ===== */
    if (!Capacitor.isNativePlatform()) {
      const SpeechAPI =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechAPI) {
        alert("Браузер не поддерживает голосовой ввод");
        return;
      }

      const recognition = new SpeechAPI();

      recognition.lang = "ru-RU";
      recognition.interimResults = false;
      recognition.continuous = true; // ✅ ЗДЕСЬ

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        console.log("VOICE (WEB):", text);

        const parsed = parseVoiceText(text);
        setVoiceData(parsed);
        setPage("add");

        recognition.stop(); // ⛔ остановка вручную
      };

      recognition.start();
      return;
    }

    /* ===== MOBILE (CAPACITOR) ===== */
    try {
      await SpeechRecognition.requestPermissions();

      const { matches } = await SpeechRecognition.start({
        language: "ru-RU",
        maxResults: 1,
        prompt: "Говорите параметры утечки",
      });

      if (!matches?.[0]) return;

      const parsed = parseVoiceText(matches[0]);
      if (Object.keys(parsed).length === 0) {
        alert("Не удалось распознать параметры");
        return;
      }

      setVoiceData(parsed);
      setPage("add");
    } catch (e) {
      console.error(e);
      alert("Ошибка голосового ввода");
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
          onVoiceInput={startVoiceInput}
        />
      )}

      {page === "db" && <DataBase data={data} setData={setData} />}
    </div>
  );
}
