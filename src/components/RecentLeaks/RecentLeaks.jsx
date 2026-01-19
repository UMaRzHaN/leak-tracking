import { timeAgo } from "../../utils/timeAgo";

export default function RecentLeaks({ leaks = [], onViewAll, onOpenDetails }) {
  const leak_level = (speed) => {
    return speed <= 25 ? "low" : speed > 100 ? "high" : "medium";
  };
  return (
    <div className="recent-leaks">
      <div className="recent-header">
        <h3>Недавнее</h3>
        <button className="view-all" onClick={onViewAll}>
          Показать все →
        </button>
      </div>

      <div className="leak-list">
        {leaks.length
          ? leaks.map((leak) => (
              <button
                key={leak.id}
                className="leak-item"
                onClick={() => onOpenDetails(leak)}
              >
                <div
                  className={`leak-icon ${leak_level(leak.leak_speed)}`}
                  aria-hidden
                />
                <div className="leak-info">
                  <div className="leak-title">{leak.component}</div>
                  <div className="leak-meta">
                    <span>
                      {leak.location ? leak.location : "Бирка №" + leak.leak_id}
                    </span>
                    •
                    <span>
                      {leak.leak_description
                        ? leak.leak_description
                        : "Скорость: " + leak.leak_speed}
                    </span>{" "}
                    •<span>{timeAgo(leak.time)}</span>
                  </div>
                </div>
                <div className="leak-arrow">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M9 6l6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>
            ))
          : "Тут пока пусто"}
      </div>
    </div>
  );
}
