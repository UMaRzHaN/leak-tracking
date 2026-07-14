import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";

const NEARBY = "nearby";
const NEARBY_RADIUS_M = 500;

function pluralLeaks(count, lang) {
  if (lang !== "ru") return count === 1 ? "record" : "records";
  if (count % 10 === 1 && count % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "записи";
  }
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
  onMonitorSelected,
  onExport,
  isExporting = false,
}) {
  const { lang } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visibleCount > 0 && (
            <>
              {`${visibleCount} ${pluralLeaks(visibleCount, lang)}`}
              {statusFilter === NEARBY ? (
                lang === "ru" ? (
                  ` • в радиусе ${NEARBY_RADIUS_M} м`
                ) : (
                  ` • within ${NEARBY_RADIUS_M} m`
                )
              ) : (
                <button
                  className={s.sortToggle}
                  onClick={onSortToggle}
                  title={
                    lang === "ru"
                      ? "Изменить порядок сортировки"
                      : "Change sort order"
                  }
                >
                  {sortAsc
                    ? lang === "ru"
                      ? "дата ↑"
                      : "date ↑"
                    : lang === "ru"
                      ? "дата ↓"
                      : "date ↓"}
                </button>
              )}
            </>
          )}
        </span>

        <div className={s.resultsActions}>
          {visibleCount > 0 && (
            <button className={s.actionBtn} onClick={onSelectDisplayed}>
              {allDisplayedSelected
                ? lang === "ru"
                  ? "Снять всё"
                  : "Clear all"
                : lang === "ru"
                  ? "Выбрать всё"
                  : "Select all"}
            </button>
          )}
          {totalCount > 0 && (
            <button
              className={s.exportBtn}
              onClick={onExport}
              disabled={isExporting}
              title={
                lang === "ru"
                  ? "Экспорт в Excel + фото (ZIP)"
                  : "Export to Excel + photos (ZIP)"
              }
            >
              {isExporting
                ? lang === "ru"
                  ? "Экспорт..."
                  : "Export..."
                : "📥 XLSX"}
            </button>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className={s.bulkBar}>
          <span className={s.bulkCheck}>✓</span>
          <span className={s.bulkCount}>
            {lang === "ru"
              ? `${selectedCount} выбрано из ${visibleCount}`
              : `${selectedCount} selected of ${visibleCount}`}
          </span>
          <div className={s.bulkBtns}>
            <button className={s.bulkClearBtn} onClick={onClearSelection}>
              {lang === "ru" ? "Снять выбор" : "Clear selection"}
            </button>
            <button className={s.bulkMonitorBtn} onClick={onMonitorSelected}>
              {lang === "ru" ? "Проверить" : "Check"}
            </button>
            <button className={s.bulkStatusBtn} onClick={onOpenBulkPicker}>
              {lang === "ru" ? "⇌ СТАТУС" : "⇌ STATUS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
