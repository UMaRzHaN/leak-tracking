import { STATUS_META, STATUS_ORDER } from "../../../utils/status";
import s from "../DataBase.module.scss";

const NEARBY = "nearby";
const NEARBY_RADIUS_M = 500;

function pluralLeaks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "записи";
  return "записей";
}

export default function ResultsBar({
  visibleCount,
  totalCount,
  statusFilter,
  sortAsc,
  onSortToggle,
  selectedCount,
  allDisplayedSelected,
  onClearSelection,
  onSelectDisplayed,
  onBulkStatusChange,
  onExport,
}) {
  return (
    <div className={s.resultsRow}>
      <span className={s.resultsInfo}>
        {visibleCount > 0 && (
          <>
            {`${visibleCount} ${pluralLeaks(visibleCount)}`}
            {statusFilter === NEARBY ? (
              ` • в радиусе ${NEARBY_RADIUS_M} м`
            ) : (
              <button
                className={s.sortToggle}
                onClick={onSortToggle}
                title="Изменить порядок сортировки"
              >
                {sortAsc ? "дата ↑" : "дата ↓"}
              </button>
            )}
          </>
        )}
      </span>

      <div
        className={`${s.resultsActions} ${selectedCount > 0 ? s.resultsActionsSelected : ""}`}
      >
        {selectedCount > 0 ? (
          <>
            <span className={s.selectionInfo}>Выбрано: {selectedCount}</span>
            <button className={s.actionBtn} onClick={onClearSelection}>
              Снять выбор
            </button>
            <div>
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  className={`${s.actionBtn} ${s.statusBtn}`}
                  style={{
                    "--status-color": STATUS_META[status].color,
                    "--status-bg": STATUS_META[status].bg,
                    "--status-border": STATUS_META[status].border,
                  }}
                  onClick={() => onBulkStatusChange(status)}
                >
                  {STATUS_META[status].short}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {visibleCount > 0 && (
              <button className={s.actionBtn} onClick={onSelectDisplayed}>
                {allDisplayedSelected ? "Снять всё" : "Выбрать всё"}
              </button>
            )}
            {totalCount > 0 && (
              <button
                className={s.exportBtn}
                onClick={onExport}
                title="Экспорт в Excel + фото (ZIP)"
              >
                📥 XLSX
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
