import { memo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";
import Icon from "@/components/ui/Icon/Icon";

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
  // Поля, по которым можно искать, — из конфигурации реестра типа проекта.
  searchFields = /** @type {{key: string, label: string}[]} */ ([]),
  searchField = "all",
  onSearchFieldChange = /** @type {((key: string) => void)|null} */ (null),
  statuses = /** @type {any[]} */ ([]),
  statusFilter = /** @type {string[]} */ ([]),
  onToggleStatus,
  onClearStatuses,
  conflictsOnly = false,
  onToggleConflicts,
  conflictCount = 0,
  counts = /** @type {Record<string, number>} */ ({}),
  hasGps = false,
  nearbyOnly = false,
  nearbyRadius = 0,
  nearbyRadiusOptions = /** @type {number[]} */ ([]),
  nearbyCount = 0,
  onToggleNearby,
  onRadiusChange,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const scoped = searchField !== "all";
  const hasActiveFilter =
    scoped || statusFilter.length > 0 || conflictsOnly || nearbyOnly;
  const fieldLabel = (field) =>
    field.key === "all"
      ? t("database.searchScopes.all")
      : t(`components.searchFields.${field.key}`, {
          defaultValue: t(`components.fields.${field.key}.label`, {
            defaultValue: field.label,
          }),
        });
  const activeField = searchFields.find((field) => field.key === searchField);
  const placeholder =
    scoped && activeField
      ? t("components.searchIn", { field: fieldLabel(activeField) })
      : t("components.searchPlaceholder");
  const formatRadius = (radius) =>
    radius >= 1000
      ? `${radius / 1000} ${t("database.radiusKm")}`
      : `${radius} ${t("database.radiusM")}`;

  return (
    <>
      <div className={s.searchRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>
            <Icon name="search" size={18} />
          </span>
          <input
            className={s.searchInput}
            placeholder={placeholder}
            value={search}
            aria-label={placeholder}
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
          {onSearchFieldChange && searchFields.length > 1 && (
            <>
              <div className={s.filterSection}>
                <span className={s.filterLabel}>
                  {t("database.searchScope")}
                </span>
                <div className={s.filters}>
                  {searchFields.map((field) => {
                    const isActive = searchField === field.key;
                    return (
                      <button
                        key={field.key}
                        type="button"
                        className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
                        aria-pressed={isActive}
                        onClick={() => onSearchFieldChange(field.key)}
                      >
                        {fieldLabel(field)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={s.filterDivider} />
            </>
          )}

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

          {/* Обход идут ногами, и чаще нужен не весь реестр, а железо, что
              стоит здесь же. Тем же тумблером и теми же радиусами, что на
              странице базы: расстояние одно и то же, где его ни спрашивай. */}
          {hasGps && (
            <div className={s.filterSection}>
              <div className={s.filterDivider} />
              <button
                type="button"
                className={`${s.nearbyToggle} ${
                  nearbyOnly ? s.nearbyToggleActive : ""
                }`}
                onClick={() => onToggleNearby?.()}
                aria-pressed={nearbyOnly}
              >
                <span className={s.nearbyLeft}>
                  <span className={s.nearbyIcon}>📌</span>
                  <span className={s.nearbyLabel}>{t("database.nearMe")}</span>
                  {nearbyCount > 0 && (
                    <span className={s.nearbyCount}>{nearbyCount}</span>
                  )}
                </span>
                <span
                  className={`${s.nearbyTrack} ${
                    nearbyOnly ? s.nearbyTrackOn : ""
                  }`}
                >
                  <span
                    className={`${s.nearbyThumb} ${
                      nearbyOnly ? s.nearbyThumbOn : ""
                    }`}
                  />
                </span>
              </button>
              {nearbyOnly && (
                <div className={s.nearbyRadiusGroup}>
                  {nearbyRadiusOptions.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      className={`${s.nearbyRadiusBtn} ${
                        nearbyRadius === radius ? s.nearbyRadiusBtnActive : ""
                      }`}
                      onClick={() => onRadiusChange?.(radius)}
                    >
                      {formatRadius(radius)}
                    </button>
                  ))}
                </div>
              )}
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
