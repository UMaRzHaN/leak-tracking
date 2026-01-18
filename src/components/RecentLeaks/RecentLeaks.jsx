import { timeAgo } from "../../utils/timeAgo";
import "./RecentLeaks.css";

export default function RecentLeaks({ leaks = [], onSelect, onViewAll }) {
  console.log(leaks);

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
            {/* <div className={`leak-icon ${leak.level}`} aria-hidden /> */}
            <div className="leak-info">
              <div className="leak-title">{leak.component}</div>
              <div className="leak-meta">
                <span>{leak.location}</span> •
                <span>{leak.leak_description}</span> •{" "}
                <span>{timeAgo(leak.time)}</span>
              </div>
            </div>
            <div className="leak-arrow">›</div>
          </button>
        ))}
      </div>
    </div>
  );
}
