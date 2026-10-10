import { memo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { pluralRecords } from "@/pages/DataBase/pluralRecords";
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
  sortAsc,
  onSortToggle,
  selectedCount = 0,
  hiddenSelectedCount = 0,
  allDisplayedSelected = false,
  onSelectDisplayed,
  onClearSelection,
  onInspectSelected,
}) {
  const { intlLocale, t } = useLanguage();

  return (
    <>
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {/* Счётчик — как у базы утечек: сколько показано сейчас, с учётом
              отборов. Своей шапки у экрана нет, как и у базы. */}
          {visibleCount > 0 && (
            <>
              {`${visibleCount} ${pluralRecords(visibleCount, t, intlLocale)}`}
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
        </div>
      </div>

      {/* Той же полосой внизу экрана, что у базы: она не уезжает при прокрутке
          длинного списка, а выбирают как раз прокручивая. Действие одно и то
          же по смыслу — отметить обойдённое, только у железа это его
          состояние, а не проверка утечки. */}
      {(selectedCount > 0 || hiddenSelectedCount > 0) && (
        <div className={s.bulkBar}>
          <span className={s.bulkCheck}>✓</span>
          <span className={s.bulkCount}>
            {t("database.selectedOf", {
              selected: selectedCount,
              visible: visibleCount,
            })}
            {hiddenSelectedCount > 0 && (
              <span className={s.bulkHidden}>
                {t("database.hiddenSelected", { count: hiddenSelectedCount })}
              </span>
            )}
          </span>
          <div className={s.bulkBtns}>
            <button className={s.bulkClearBtn} onClick={onClearSelection}>
              {t("database.clearSelection")}
            </button>
            <button
              className={s.bulkMonitorBtn}
              onClick={onInspectSelected}
              disabled={selectedCount === 0}
            >
              {t("components.bulkStatus")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(ComponentResultsBar);
