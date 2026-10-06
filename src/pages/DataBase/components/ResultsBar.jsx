import { useLanguage } from "@/app/hooks/useLanguage";
import { pluralRecords } from "@/pages/DataBase/pluralRecords";
import { NEARBY, NEARBY_RADIUS_M } from "@/domain/leakFilters";
import s from "@/pages/DataBase/DataBase.module.scss";

export default function ResultsBar({
  visibleCount,
  statusFilter,
  sortAsc,
  onSortToggle,
  selectedCount,
  allDisplayedSelected,
  onClearSelection,
  onSelectDisplayed,
  onMonitorSelected,
  onEditBulkCalculation,
}) {
  const { intlLocale, t } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visibleCount > 0 && (
            <>
              {`${visibleCount} ${pluralRecords(visibleCount, t, intlLocale)}`}
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
