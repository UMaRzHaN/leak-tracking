import "./QuickActions.css";

export default function QuickActions({ setPage, setGpsEnabled, gpsEnabled }) {
  return (
    <div className="quick-actions">
      <button className="qa-btn primary" onClick={() => setPage("add")}>
        <span className="qa-icon">➕</span>
        <span className="qa-text">Добавить утечку</span>
      </button>

      <button className="qa-btn" onClick={() => setPage("db")}>
        <span className="qa-icon">📄</span>
        <span className="qa-text">База данных</span>
      </button>

      <button className="qa-btn" onClick={() => setPage("map")}>
        <span className="qa-icon">🗺</span>
        <span className="qa-text">Карта утечек</span>
      </button>

      <button
        className={`qa-btn ${gpsEnabled ? "active" : ""}`}
        onClick={() => setGpsEnabled((v) => !v)}
      >
        <span className="qa-icon">{gpsEnabled ? "⏸" : "▶️"}</span>
        <span className="qa-text">
          {gpsEnabled ? "Пауза GPS" : "Запустить GPS"}
        </span>
      </button>
    </div>
  );
}
