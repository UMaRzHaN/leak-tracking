import s from "../index.scss";
import { useEffect } from "react";

import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";

import AddLeak from "../pages/AddLeak";
import DataBase from "../pages/DataBase";
import MapPage from "../pages/MapPage";
import MainPage from "../pages/MainPage";
import Settings from "../pages/Settings/Settings";

import { useAppState } from "./hooks/useAppState";
import { useAppStorage } from "./hooks/useAppStorage";
import { useVoiceControl } from "./hooks/useVoiceControl";

export default function App() {
  const {
    page,
    setPage,
    data,
    setData,
    gpsEnabled,
    setGpsEnabled,
    coords,
    geoError,
    geoLoading,
  } = useAppState();

  const { clearDatabase } = useAppStorage(setData);

  const { voiceData, clearVoiceData, startVoiceInput, stopVoiceInput } =
    useVoiceControl(setPage);

  // Очищаем старые данные формата data:image из localStorage при загрузке
  useEffect(() => {
    const keys = Object.keys(localStorage);
    let hasOldFormat = false;
    
    for (const key of keys) {
      if (key.startsWith("leaks_database:")) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (Array.isArray(data) && data.some(item => item.photo?.startsWith("data:image"))) {
            hasOldFormat = true;
            break;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    if (hasOldFormat) {
      console.log("🧹 Очищаем старые данные с base64 фото из localStorage");
      // Удаляем все старые записи
      keys.forEach(key => {
        if (key.startsWith("leaks_database:")) {
          localStorage.removeItem(key);
        }
      });
      // Перезагружаем страницу
      window.location.reload();
    }
  }, []);

  const hideLayout = page === "add" || page === "settings";

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

        {page === "map" && <MapPage leaks={data} coords={coords} />}

        {page === "settings" && <Settings setPage={setPage} />}
      </div>

      {!hideLayout && <Footer page={page} setPage={setPage} />}
    </div>
  );
}
