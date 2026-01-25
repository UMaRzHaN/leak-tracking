import s from "../index.scss";

import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";

import AddLeak from "../pages/AddLeak";
import DataBase from "../pages/DataBase";
import MapPage from "../pages/MapPage";
import MainPage from "../pages/MainPage";

import { useAppState } from "./useAppState";
import { useAppStorage } from "./useAppStorage";
import { useVoiceControl } from "./useVoiceControl";

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
      </div>

      {!hideLayout && <Footer page={page} setPage={setPage} />}
    </div>
  );
}
