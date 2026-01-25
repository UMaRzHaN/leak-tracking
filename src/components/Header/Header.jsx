import s from "./Header.module.scss";
export default function Header({ setPage, geoError, coords, geoLoading }) {
  return (
    <header className={s.header} onClick={() => setPage("")}>
      Журнал утечек газа
      <div className={s.coords}>
        {geoError ? (
          <b>Локация 📍 {geoError}</b>
        ) : geoLoading ? (
          <b>Локация 📍 Определение…</b>
        ) : coords.lat && coords.lng ? (
          <b>
            Локация 📍 {coords.lat.toFixed(6)} / {coords.lng.toFixed(6)}
          </b>
        ) : (
          <b>Локация 📍 Нет данных</b>
        )}
      </div>
    </header>
  );
}
