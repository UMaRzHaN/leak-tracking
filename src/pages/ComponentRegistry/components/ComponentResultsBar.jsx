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
  onRemoveSelected,
  onExport,
  isExporting = false,
}) {
  const { t } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visibleCount > 0 && (
            <>
              {t("components.shown", { count: visibleCount })}
              <button
                className={s.sortToggle}
                onClick={onSortToggle}
                title={t("components.changeSortOrder")}
              >
                {sortAsc ? t("components.uidAsc") : t("components.uidDesc")}
              </button>
            </>
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

      {/* Появляется, только когда что-то выбрано: полоса действий над пустым
          выбором предлагает то, чего никто не начинал. */}
      {selectedCount > 0 && (
        <div className={s.resultsRow}>
          <span className={s.resultsInfo}>
            {t("components.selected", { count: selectedCount })}
          </span>
          <div className={s.resultsActions}>
            <button className={s.actionBtn} onClick={onClearSelection}>
              {t("components.clearSelection")}
            </button>
            <button className={s.actionBtn} onClick={onRemoveSelected}>
              {t("components.removeSelected")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(ComponentResultsBar);
