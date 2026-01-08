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
import { capitalizeFirst } from "./utils/calculations";

const STORAGE_KEY = "leaks_database_v1";
const FIELD_MARKERS =
  "умг|компрессорная станция|примечание|локация|объект|компонент|описание утечки|причина утечки|решение|план устранения|мтр";

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
      regex: /температур[аы]?\s*(-?\d+(\.\d+)?)/,
      type: "number",
    },

    {
      key: "field",
      regex: new RegExp(
        `(?:умг|умк|умгэ|умге|умга|омг|управление)\\s+(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "station",
      regex: new RegExp(
        `компрессорная станци[я]\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "note",
      regex: new RegExp(`примечани[ея]\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "location",
      regex: new RegExp(`локаци[яи]\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "object",
      regex: new RegExp(`объект\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "component",
      regex: new RegExp(`компонент[ы]?\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
    {
      key: "leak_description",
      regex: new RegExp(
        `описание утечк[и]\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "leak_cause",
      regex: new RegExp(
        `причина утечк[и]\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "technological_solution",
      regex: new RegExp(
        `(технологическ(ое|ий) решени(е|я)|тех решени(е|я)|способ устранени(й|я)|метод устранени(й|я)\\s+(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "repair_recommendation",
      regex: new RegExp(
        `план устранения\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`
      ),
      type: "string",
    },
    {
      key: "materials_equipment",
      regex: new RegExp(`мтр\\s*(.+)(?=\\s+(?:${FIELD_MARKERS})|$)`),
      type: "string",
    },
  ];

  patterns.forEach(({ key, regex, type }) => {
    const match = normalized.match(regex);
    if (!match) return;

    result[key] =
      type === "number"
        ? Number(match[1])
        : capitalizeFirst(match[match.length - 1].trim());
  });

  return result;
};

export default function App() {
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const [voiceData, setVoiceData] = useState(null);
  const recognitionRef = useRef(null);

  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  /* =========================
     VOICE INPUT
  ========================= */
  const startVoiceInput = async () => {
    if (isRecording) return;

    setIsRecording(true);
    setVoiceData(null);

    /* ===== WEB ===== */
    if (!Capacitor.isNativePlatform()) {
      const SpeechAPI =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechAPI) {
        alert("Браузер не поддерживает голосовой ввод");
        setIsRecording(false);
        return;
      }

      const recognition = new SpeechAPI();
      recognitionRef.current = recognition;

      recognition.lang = "ru-RU";
      recognition.interimResults = false;
      recognition.continuous = false; // 🔥 ВАЖНО

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        const normalizedText = normalizeNumberWords(text);
        const parsed = parseVoiceText(normalizedText);
        const normalized = normalizeSynonyms(parsed);
        // component
        if (normalized.component) {
          const res = normalizeEquipment(normalized.component);
          normalized.component = res.value;
          if (res.type) normalized.component_type = res.type;
        }

        // object
        if (normalized.object) {
          const res = normalizeEquipment(normalized.object);
          normalized.object = res.value;
          if (res.type) normalized.object_type = res.type;
        }
        console.log(normalizedText);

        setVoiceData(normalized);
        setPage("add");
      };

      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognition.start();
      return;
    }

    /* ===== MOBILE ===== */
    try {
      await SpeechRecognition.requestPermissions();

      await SpeechRecognition.start({
        language: "ru-RU",
        partialResults: false,
        popup: false,
      });
    } catch (e) {
      setIsRecording(false);
      alert("Ошибка голосового ввода");
    }
  };

  const stopVoiceInput = async () => {
    if (!isRecording) return;

    /* ===== WEB ===== */
    if (!Capacitor.isNativePlatform()) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    /* ===== MOBILE ===== */
    try {
      const { matches } = await SpeechRecognition.stop();
      setIsRecording(false);

      if (!matches || !matches[0]) return;

      const text = matches[0];

      // 1️⃣ нормализация чисел и размеров
      const normalizedText = normalizeNumberWords(text);

      // 2️⃣ парсинг полей
      const parsed = parseVoiceText(normalizedText);

      // 3️⃣ нормализация причин / рекомендаций
      const data = normalizeSynonyms(parsed);

      // 4️⃣ component → normalizeEquipment
      if (data.component) {
        const res = normalizeEquipment(data.component);
        data.component = res.value;
        if (res.type) data.component_type = res.type;
      }

      // 5️⃣ object → normalizeEquipment
      if (data.object) {
        const res = normalizeEquipment(data.object);
        data.object = res.value;
        if (res.type) data.object_type = res.type;
      }

      // 6️⃣ передаём в форму
      setVoiceData(data);
      setPage("add");
    } catch (e) {
      console.error("Voice stop error:", e);
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
      )}

      {page === "db" && <DataBase data={data} setData={setData} />}
    </div>
  );
}
