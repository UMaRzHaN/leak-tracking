import { useState, useEffect } from "react";
import { Geolocation } from "@capacitor/geolocation";
import AddLeak from "./pages/AddLeak";
import DataBase from "./pages/DataBase";
import "./index.css";

const STORAGE_KEY = "leaks_database_v1";

export default function App() {
  const [page, setPage] = useState("db");
  const [data, setData] = useState([]);

  const [coords, setCoords] = useState({ lat: null, lon: null });
  const [error, setError] = useState(null);

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
      <div className="header" onClick={() => setPage("add")}>
        Журнал утечек газа
      </div>

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
        <AddLeak data={data} setData={setData} coords={coords} />
      )}

      {page === "db" && <DataBase data={data} setData={setData} />}
    </div>
  );
}
