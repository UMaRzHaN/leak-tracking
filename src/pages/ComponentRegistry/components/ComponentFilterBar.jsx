import { memo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";

/**
 * Поиск и фильтры реестра — той же полосой, что на странице базы.
 *
 * Не своя раскладка, а её же таблица стилей: рука, научившаяся искать утечку,
 * не должна переучиваться, дойдя до железа. Отличается набор признаков, а не
 * расположение — состояние железа вместо статуса ремонта и приоритета.
 *
 * Место здесь не выбирается: его выбирают в шапке, и это один выбор на базу,
 * карту, мониторинг и реестр. Второй рядом с первым означал бы два ответа на
 * один вопрос.
 */
function ComponentFilterBar({
  search,
  setSearch,
  statuses = [],
  statusFilter = [],
  onToggleStatus,
  onClearStatuses,
  conflictsOnly = false,
  onToggleConflicts,
  conflictCount = 0,
  counts = /** @type {Record<string, number>} */ ({}),
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const hasActiveFilter = statusFilter.length > 0 || conflictsOnly;

  return (
    <>
      <div className={s.searchRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            placeholder={t("components.searchPlaceholder")}
            value={search}
            aria-label={t("components.searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              className={s.clearSearch}
              onClick={() => setSearch("")}
              type="button"
              aria-label={t("database.clearSearch")}
            >
              ✕
            </button>
          )}
        </div>
        <button
          className={`${s.filterToggleBtn} ${open ? s.filterToggleBtnOpen : ""}`}
          onClick={(event) => {
            setOpen((value) => !value);
            if (open) event.currentTarget.blur();
          }}
          type="button"
          aria-label={t("database.filters")}
          aria-expanded={open}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M9.969 8.006v7.038L6.03 12.917v-4.91L1.084 1.043h14.003L9.97 8.006z"
              fill="currentColor"
            />
          </svg>
          {hasActiveFilter && <span className={s.filterBadge} />}
        </button>
      </div>

      {open && (
        <div className={s.filtersPanel}>
          {/* Только состояния, которые встречаются: пустая кнопка ничего не
              отбирает и лишь удлиняет ряд. */}
          {statuses.length > 0 && (
            <div className={s.filterSection}>
              <span className={s.filterLabel}>
                {t("components.statusFilter")}
              </span>
              <div className={s.filters}>
                <button
                  type="button"
                  className={`${s.filterTab} ${
                    statusFilter.length === 0 ? s.filterActive : ""
                  }`}
                  onClick={onClearStatuses}
                >
                  {t("components.allStatuses")}
                  <span className={s.filterCount}>{counts.all ?? 0}</span>
                </button>
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`${s.filterTab} ${
                      statusFilter.includes(status) ? s.filterActive : ""
                    }`}
                    aria-pressed={statusFilter.includes(status)}
                    onClick={() => onToggleStatus(status)}
                  >
                    {status}
                    <span className={s.filterCount}>{counts[status] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Совпавшие номера — не признак карточки, а работа, которую надо
              доделать; поэтому отдельной строкой, а не среди состояний. */}
          {conflictCount > 0 && (
            <div className={s.filterSection}>
              <span className={s.filterLabel}>
                {t("components.conflictFilter")}
              </span>
              <div className={s.filters}>
                <button
                  type="button"
                  className={`${s.filterTab} ${
                    conflictsOnly ? s.filterActive : ""
                  }`}
                  aria-pressed={conflictsOnly}
                  onClick={onToggleConflicts}
                >
                  {t("components.showConflicts")}
                  <span className={s.filterCount}>{conflictCount}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(ComponentFilterBar);
