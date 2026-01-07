import { useState, useEffect, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import "./index.css";

import { SpeechRecognition } from "@capacitor-community/speech-recognition";

const STORAGE_KEY = "leaks_database_v1";

const parseVoiceText = (text) => {
  const result = {};

  const normalized = text.toLowerCase().replace(",", ".");

  const patterns = [
    { key: "leak_speed", regex: /скорост[ьи]?\s*(\d+(\.\d+)?)/ },
    { key: "temperature", regex: /температур[аы]?\s*(-?\d+)/ },
    { key: "pressure", regex: /давлени[ея]?\s*(\d+(\.\d+)?)/ },
    { key: "leak_id", regex: /утечк[аи]?\s*(\d+)/ },
    { key: "video_id", regex: /видео\s*(\d+)/ },
    { key: "leak_description", regex: /описани[е,я]\s*(\d+)/ },
    { key: "technological_solution", regex: /техрешени[e,я]\s*(\d+)/ },
    { key: "repair_recommendation", regex: /устрани[e,я]\s*(\d+)/ },
    { key: "materials_equipment", regex: /МТР\s*(\d+)/ },
    { key: "note", regex: /Примечани[e,я]\s*(\d+)/ },
  ];

  patterns.forEach(({ key, regex }) => {
    const match = normalized.match(regex);
    if (match) result[key] = Number(match[1]);
  });

  return result;
};

export default function App() {
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);

  // 🔹 Голосовой ввод
  const startVoiceInput = async () => {
    try {
      await SpeechRecognition.requestPermissions();

      const { matches } = await SpeechRecognition.start({
        language: "ru-RU",
        maxResults: 1,
        prompt: "Говорите параметры утечки",
      });

      if (!matches || !matches[0]) return;

      const parsed = parseVoiceText(matches[0]);

      if (Object.keys(parsed).length === 0) {
        alert("Не удалось распознать параметры");
        return;
      }

      setVoiceData(parsed);
      setPage("add");
    } catch (e) {
      alert("Ошибка голосового ввода");
      console.error(e);
    }
  };

  const [voiceData, setVoiceData] = useState(null);
  const clearVoiceData = useCallback(() => {
    setVoiceData(null);
  }, []);

  // 🔹 Загрузка данных из localStorage при старте
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

  // 🔹 Геолокация
  useEffect(() => {
    const getLocation = async () => {
      try {
        const perm = await Geolocation.requestPermissions();

        if (perm.location !== "granted") {
          setError("Нет разрешения на геолокацию");
          return;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
        });

        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      } catch (err) {
        setError(err.message || "Ошибка получения координат");
      }
    };

    getLocation();
  }, []);

  const clearDatabase = () => {
    if (!window.confirm("Вы уверены, что хотите удалить ВСЮ базу данных?")) {
      return;
    }

    localStorage.removeItem("leaks_database_v1");
    setData([]);
  };
  return (
    <div className="app">
      {/* Header */}
      <div className="header">Журнал утечек газа</div>

      {/* Навигация + координаты */}
      <div className="card">
        <div style={{ color: "#546e7a" }}>
          {error ? (
            <span>
              <b>Локация📍</b> {error}
            </span>
          ) : coords.lat && coords.lon ? (
            <span>
              <b>Локация📍</b>
              <b>X/ Y: </b>
              {coords.lat.toFixed(6)}/ {coords.lon.toFixed(6)}
            </span>
          ) : (
            <span>
              <b>Локация📍</b> Определение координат…
            </span>
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

      {/* Страницы */}
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
