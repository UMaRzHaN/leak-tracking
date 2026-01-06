import { useState, useEffect } from "react";
import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import "./index.css";

const STORAGE_KEY = "leaks_database_v1";

export default function App() {
  const [page, setPage] = useState("add");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Геолокация не обнаружена");
      return;
    }

    const success = (position) => {
      setCoords({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
    };

    const handleError = (err) => {
      setError(`Ошибка: ${err.message}`);
    };

    // Запрос координат
    navigator.geolocation.getCurrentPosition(success, handleError);
  }, []);

  // 🔹 Загрузка БД из localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setData(JSON.parse(saved));
    }
  }, []);

  return (
    <div className="app">
      <div className="header" onClick={() => setPage("add")}>
        Журнал утечек газа
      </div>

      <div className="card">
        <div>
          {error ? (
            <p>{error}</p>
          ) : (
            <p>
              📍 X: {coords.lat}, Y: {coords.lon}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (window.confirm("Очистить всю базу данных?")) {
              localStorage.removeItem("leaks_database_v1");
              setData([]);
            }
          }}
        >
          🧹 Очистить базу
        </button>
        <button onClick={() => setPage("db")}>
          📄 База данных ({data.length})
        </button>
      </div>

      {page === "add" && (
        <AddLeak data={data} setData={setData} coords={coords} />
      )}

      {page === "db" && <DataBase data={data} setData={setData} />}
    </div>
  );
}
