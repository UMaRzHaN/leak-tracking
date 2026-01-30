import { timeAgo } from "../../utils/calculations/timeAgo";
import s from "./RecentLeaks.module.scss";

const leakLevel = (speed = 0) =>
  speed <= 25 ? "low" : speed >= 100 ? "high" : "medium";
export default function RecentLeaks({
  leaks = [],
  onViewAll,
  onOpenDetails,
  setPage,
}) {
  return (
    <div className={s.recentLeaks}>
      <div className={s.recentHeader}>
        <h3 className={s.title}>Недавнее</h3>
        <button className={s.viewAll} onClick={onViewAll}>
          Показать все →
        </button>
      </div>

      <div className={s.leakList}>
        {leaks.length ? (
          leaks.map((leak) => (
            <button
              key={leak.id}
              className={s.leakItem}
              onClick={() => onOpenDetails(leak)}
            >
              <div
                className={`${s.leakIcon} ${s[leakLevel(leak.leak_speed)]}`}
                aria-hidden
              />

              <div className={s.leakInfo}>
                <div className={s.leakTitle}>{leak.component}</div>

                <div className={s.leakMeta}>
                  <span>
                    {leak.location ? leak.location : `Бирка №${leak.leak_id}`}
                  </span>
                  <span>•</span>
                  <span>
                    {leak.leak_description
                      ? leak.leak_description
                      : `Видео: ${leak.video_id}`}
                  </span>
                  <span>•</span>
                  <br />
                  <span>
                    {leak.Emissions_t_CO2eq_year
                      ? Math.ceil(leak.Emissions_t_CO2eq_year)
                          .toLocaleString("ru-RU")
                          .replace(/\s/g, ".") + " (т CO₂-экв/год)"
                      : `Скорость: ${leak.leak_speed}`}
                  </span>
                  <span>•</span>
                  <span>{timeAgo(leak.createdAt)}</span>
                </div>
              </div>

              <div className={s.leakArrow} aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24">
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
        ) : (
          <div className={s.emptyRecent}>
            <div className={s.emptyRecentTitle}>
              Пока нет добавленных утечек
            </div>

            <div className={s.emptyRecentHint}>
              Добавьте первую запись, чтобы она появилась здесь.
            </div>

            <button
              className={s.emptyRecentLink}
              onClick={() => setPage("add")}
            >
              + Добавить первую утечку
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
