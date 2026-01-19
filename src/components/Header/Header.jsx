import s from "./Header.module.scss"
export default function Header({ setPage, geoError, coords, geoLoading }) {
  return (
    <header className={s.header} onClick={() => setPage("")}>
      Журнал утечек газа
      <div style={{ color: "gray", marginTop: 10 }}>
        {geoError ? (
          <b>Локация 📍 {geoError}</b>
        ) : geoLoading ? (
          <b>Локация 📍 Определение…</b>
        ) : coords.lat && coords.lon ? (
          <b>
            Локация 📍 {coords.lat.toFixed(6)} / {coords.lon.toFixed(6)}
          </b>
        ) : (
          <b>Локация 📍 Нет данных</b>
        )}
      </div>
    </header>
  );
}
