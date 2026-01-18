import "./RecentLeaks.css";

export default function RecentLeaks({ leaks = [], onSelect, onViewAll }) {
  return (
    <div className="recent-leaks">
      <div className="recent-header">
        <h3>Недавнее</h3>
        <button className="view-all" onClick={onViewAll}>
          Показать все →
        </button>
      </div>

      <div className="leak-list">
        {leaks.map((leak) => (
          <button
            key={leak.id}
            className="leak-item"
            onClick={() => onSelect(leak)}
          >
            <div className={`leak-icon ${leak.level}`} aria-hidden />
            <div className="leak-info">
              <div className="leak-title">{leak.title}</div>
              <div className="leak-meta">
                {leak.levelLabel} • {leak.location} • {leak.time}
              </div>
            </div>
            <div className="leak-arrow">›</div>
          </button>
        ))}
      </div>
    </div>
  );
}
