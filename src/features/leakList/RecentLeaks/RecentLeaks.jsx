import RecentLeakItem from "./RecentLeaksItem";
import s from "./RecentLeaks.module.scss";

export default function RecentLeaks({
  leaks = [],
  onViewAll,
  onOpenDetails,
  setPage,
  onRemove,
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
            <RecentLeakItem
              key={leak.id}
              leak={leak}
              onOpenDetails={onOpenDetails}
              onRemove={onRemove}
            />
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
