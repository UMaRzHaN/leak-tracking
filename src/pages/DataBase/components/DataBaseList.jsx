import LeakCardCompact from "../../../components/LeakCardCompact/LeakCardCompact";
import s from "./DataBaseList.module.scss";

export default function DataBaseList({
  data,
  onStatusChange,
  onOpenDetails,
  setPage,
}) {
  if (!data.length) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyTitle}>Нет записей</div>

        <div className={s.emptySubtitle}>
          Утечки за текущий период не найдены.
        </div>

        <div className={s.emptyHints}>
          • Проверьте фильтры <br />• Добавьте новую запись
        </div>

        <button className={s.emptyAddBtn} onClick={() => setPage("add")}>
          <span className={s.emptyAddIcon}>＋</span>
          Добавить утечку
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {data.map((row) => (
        <LeakCardCompact
          key={row.id}
          leak={row}
          onStatusChange={onStatusChange}
          onOpenDetails={onOpenDetails}
        />
      ))}
    </div>
  );
}
