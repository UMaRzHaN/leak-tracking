import s from "@/pages/DataBase/DataBase.module.scss";

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
  onOpenBulkPicker,
  onExport,
}) {
  return (
    <>
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

        <div className={s.resultsActions}>
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
        </div>
      </div>

      {selectedCount > 0 && (
        <div className={s.bulkBar}>
          <span className={s.bulkCheck}>✓</span>
          <span className={s.bulkCount}>
            {selectedCount} выбрано из {visibleCount}
          </span>
          <div className={s.bulkBtns}>
            <button className={s.bulkClearBtn} onClick={onClearSelection}>
              Снять выбор
            </button>
            <button className={s.bulkStatusBtn} onClick={onOpenBulkPicker}>
              ⇌ СТАТУС
            </button>
          </div>
        </div>
      )}
    </>
  );
}
