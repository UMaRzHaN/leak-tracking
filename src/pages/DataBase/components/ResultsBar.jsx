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
  onMonitorSelected,
  onEditBulkCalculation,
  onExport,
  isExporting = false,
}) {
  const { lang, t } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visibleCount > 0 && (
            <>
              {`${visibleCount} ${pluralLeaks(visibleCount, lang)}`}
              {statusFilter === NEARBY ? (
                t("database.nearbyRadius", { radius: NEARBY_RADIUS_M })
              ) : (
                <button
                  className={s.sortToggle}
                  onClick={onSortToggle}
                  title={t("database.changeSortOrder")}
                >
                  {sortAsc ? t("database.dateAsc") : t("database.dateDesc")}
                </button>
              )}
            </>
          )}
        </span>

        <div className={s.resultsActions}>
          {visibleCount > 0 && (
            <button className={s.actionBtn} onClick={onSelectDisplayed}>
              {allDisplayedSelected
                ? t("database.clearAll")
                : t("database.selectAll")}
            </button>
          )}
          {totalCount > 0 && (
            <button
              className={s.exportBtn}
              onClick={onExport}
              disabled={isExporting}
              title={t("database.exportZip")}
            >
              {isExporting ? t("database.exporting") : "📥 XLSX"}
            </button>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className={s.bulkBar}>
          <span className={s.bulkCheck}>✓</span>
          <span className={s.bulkCount}>
            {t("database.selectedOf", {
              selected: selectedCount,
              visible: visibleCount,
            })}
          </span>
          <div className={s.bulkBtns}>
            <button className={s.bulkClearBtn} onClick={onClearSelection}>
              {t("database.clearSelection")}
            </button>
            <button className={s.bulkMonitorBtn} onClick={onMonitorSelected}>
              {t("database.check")}
            </button>
            <button
              className={s.bulkCalcBtn}
              onClick={onEditBulkCalculation}
              title={t("database.editCalcParamsForSelected")}
              aria-label={t("database.calcParams")}
            >
              ⚙
            </button>
          </div>
        </div>
      )}
    </>
  );
}
