import { memo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";

/**
 * Что показано, в каком порядке и что с этим делать — той же полосой, что на
 * странице базы.
 *
 * Сортировка по номеру, а не по дате: у утечек список читают по свежести,
 * потому что важно, что нашли сегодня, а обход идут по номерам, и «9 после 1»
 * вместо «9 после 8» сбивает поиск нужной карточки глазами.
 */
function ComponentResultsBar({
  visibleCount,
  totalCount,
  sortAsc,
  onSortToggle,
  selectedCount = 0,
  allDisplayedSelected = false,
  onSelectDisplayed,
  onClearSelection,
  onInspectSelected,
  onExport,
  isExporting = false,
}) {
  const { t } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {/* Счётчик отсюда убран: сколько карточек заведено, сказано выше в
              шапке, а при отборе там же появляется и сколько показано. */}
          {visibleCount > 0 && (
            <button
              className={s.sortToggle}
              onClick={onSortToggle}
              title={t("components.changeSortOrder")}
            >
              {sortAsc ? t("components.uidAsc") : t("components.uidDesc")}
            </button>
          )}
        </span>

        <div className={s.resultsActions}>
          {visibleCount > 0 && (
            <button
              className={s.actionBtn}
              onClick={
                allDisplayedSelected ? onClearSelection : onSelectDisplayed
              }
            >
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
              title={t("components.export.button")}
            >
              {isExporting ? t("database.exporting") : "📥 XLSX"}
            </button>
          )}
        </div>
      </div>

      {/* Той же полосой внизу экрана, что у базы: она не уезжает при прокрутке
          длинного списка, а выбирают как раз прокручивая. Действие одно и то
          же по смыслу — отметить обойдённое, только у железа это его
          состояние, а не проверка утечки. */}
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
            <button className={s.bulkMonitorBtn} onClick={onInspectSelected}>
              {t("components.bulkStatus")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(ComponentResultsBar);
