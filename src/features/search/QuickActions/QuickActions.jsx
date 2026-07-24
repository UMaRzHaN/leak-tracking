import s from "./QuickActions.module.scss";
export default function QuickActions({ setPage, setGpsEnabled, gpsEnabled }) {
  return (
    <div className={s.quickActions}>
      <button
        className={`${s.qaBtn} ${s.primary}`}
        onClick={() => setPage("add")}
      >
        <span className={s.qaIcon}>➕</span>
        <span className={s.qaText}>Добавить утечку</span>
      </button>

      <button className={s.qaBtn} onClick={() => setPage("db")}>
        <span className={s.qaIcon}>📄</span>
        <span className={s.qaText}>База данных</span>
      </button>

      <button className={s.qaBtn} onClick={() => setPage("map")}>
        <span className={s.qaIcon}>🗺</span>
        <span className={s.qaText}>Карта утечек</span>
      </button>

      <button
        className={`${s.qaBtn} ${gpsEnabled ? s.active : ""}`}
        onClick={() => setGpsEnabled((v) => !v)}
      >
        <span className={s.qaIcon}>{gpsEnabled ? "⏸" : "▶️"}</span>
        <span className={s.qaText}>
          {gpsEnabled ? "Пауза GPS" : "Запустить GPS"}
        </span>
      </button>
    </div>
  );
}
