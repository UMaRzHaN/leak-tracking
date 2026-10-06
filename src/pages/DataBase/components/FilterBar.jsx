import { useState, memo } from "react";
import { STATUS_META, STATUS_ORDER, getStatusMeta } from "@/utils/status";
import { PRIORITY_ORDER, getPriorityMeta } from "@/utils/priority";
import { useLanguage } from "@/app/hooks/useLanguage";
import { FICTION_FILTER, SEARCH_SCOPE, TAG_FILTER } from "@/domain/leakFilters";
import s from "@/pages/DataBase/DataBase.module.scss";
import Icon from "@/components/ui/Icon/Icon";

const ALL = "all";
const SEARCH_SCOPES = Object.values(SEARCH_SCOPE);

function normalizeSelected(value) {
  if (Array.isArray(value)) return value;
  return value && value !== ALL ? [value] : [];
}

function toggleSelected(current, value) {
  const selected = normalizeSelected(current);
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

function FilterBar({
  search,
  setSearch,
  // Где искать: во всех полях или в одном выбранном.
  searchScope = SEARCH_SCOPE.ALL,
  setSearchScope = /** @type {((value: string) => void)|null} */ (null),
  statusFilter,
  setFilter,
  priorityFilter,
  setPriorityFilter,
  fictionFilter = FICTION_FILTER.ALL,
  setFictionFilter = /** @type {((value: string) => void)|null} */ (null),
  // Физ. тег — только в обходе; в базе группы нет.
  tagFilter = TAG_FILTER.ALL,
  setTagFilter = /** @type {((value: string) => void)|null} */ (null),
  nearbyFilter,
  setNearbyFilter,
  nearbyRadius,
  setNearbyRadius,
  nearbyRadiusOptions,
  counts,
  hasGps,
}) {
  const { t } = useLanguage();
  const selectedStatuses = normalizeSelected(statusFilter);
  const selectedPriorities = normalizeSelected(priorityFilter);
  // Location is chosen in the header's folder browser, not here: two controls
  // over the same three filters would drift apart and duplicate the logic.
  const scoped = setSearchScope !== null && searchScope !== SEARCH_SCOPE.ALL;
  const hasActiveFilter =
    scoped ||
    selectedStatuses.length > 0 ||
    selectedPriorities.length > 0 ||
    fictionFilter !== FICTION_FILTER.ALL ||
    (setTagFilter !== null && tagFilter !== TAG_FILTER.ALL) ||
    nearbyFilter;
  const [open, setOpen] = useState(false);
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
            placeholder={
              scoped
                ? t(`database.searchIn.${searchScope}`)
                : t("database.searchPlaceholder")
            }
            value={search}
            aria-label={t("database.searchLeaks")}
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
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          )}
        </div>
        <button
          className={`${s.filterToggleBtn} ${
            open ? s.filterToggleBtnOpen : ""
          }`}
          onClick={(event) => {
            setOpen((value) => !value);
            if (open) event.currentTarget.blur();
          }}
          type="button"
          aria-label={t("database.filters")}
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
          {setSearchScope && (
            <>
              <div className={s.filterSection}>
                <span className={s.filterLabel}>
                  {t("database.searchScope")}
                </span>
                <div className={s.filters}>
                  {SEARCH_SCOPES.map((scope) => {
                    const isActive = searchScope === scope;
                    return (
                      <button
                        key={scope}
                        type="button"
                        className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
                        aria-pressed={isActive}
                        onClick={() => setSearchScope(scope)}
                      >
                        {t(`database.searchScopes.${scope}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={s.filterDivider} />
            </>
          )}

          <div className={s.filterSection}>
            <span className={s.filterLabel}>{t("database.status")}</span>
            <div className={s.filters}>
              <FilterTab
                id={ALL}
                label={t("database.all")}
                count={counts.all}
                active={selectedStatuses.length === 0}
                onSelect={setFilter}
              />
              {STATUS_ORDER.map((status) => {
                const meta = getStatusMeta(status, t);

                return (
                  <FilterTab
                    key={status}
                    id={status}
                    label={meta.short}
                    count={counts[status]}
                    active={selectedStatuses.includes(status)}
                    onSelect={setFilter}
                    color={STATUS_META[status].color}
                    bg={STATUS_META[status].bg}
                    border={STATUS_META[status].border}
                  />
                );
              })}
            </div>
          </div>

          <div className={s.filterDivider} />

          <div className={s.filterSection}>
            <span className={s.filterLabel}>{t("database.priority")}</span>
            <div className={s.priorityFilters}>
              <button
                className={`${s.priorityTab} ${
                  selectedPriorities.length === 0 ? s.priorityTabActive : ""
                }`}
                style={
                  selectedPriorities.length === 0
                    ? {
                        color: "var(--c-accent)",
                        background: "var(--c-accent-dim)",
                        borderColor: "var(--c-accent)",
                      }
                    : undefined
                }
                onClick={() => setPriorityFilter([])}
              >
                {t("database.all")}
              </button>
              {PRIORITY_ORDER.map((priority) => {
                const meta = getPriorityMeta(priority, t);
                const isActive = selectedPriorities.includes(priority);

                return (
                  <button
                    key={priority}
                    className={`${s.priorityTab} ${
                      isActive ? s.priorityTabActive : ""
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: meta.border,
                            color: meta.color,
                            background: meta.bg,
                          }
                        : undefined
                    }
                    onClick={() =>
                      setPriorityFilter((current) =>
                        toggleSelected(current, priority),
                      )
                    }
                  >
                    {meta.short}
                  </button>
                );
              })}
            </div>
          </div>

          {setFictionFilter && (
            <>
              <div className={s.filterDivider} />

              <div className={s.filterSection}>
                <span className={s.filterLabel}>{t("database.fiction")}</span>
                <div className={s.filters}>
                  {[
                    [
                      FICTION_FILTER.ALL,
                      t("database.all"),
                      counts.fiction + counts.notFiction,
                    ],
                    [
                      FICTION_FILTER.ONLY,
                      t("database.fictionOnly"),
                      counts.fiction,
                    ],
                    [
                      FICTION_FILTER.EXCLUDE,
                      t("database.fictionExclude"),
                      counts.notFiction,
                    ],
                  ].map(([id, label, count]) => {
                    const isActive = fictionFilter === id;
                    // Фикции — своим фиолетовым, как плашка на карточке.
                    const style =
                      isActive && id === FICTION_FILTER.ONLY
                        ? {
                            color: "var(--c-fiction)",
                            background:
                              "color-mix(in srgb, var(--c-fiction) 14%, transparent)",
                            borderColor: "var(--c-fiction)",
                          }
                        : undefined;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
                        style={style}
                        aria-pressed={isActive}
                        onClick={() => setFictionFilter(id)}
                      >
                        {label}
                        {count > 0 && (
                          <span className={s.filterCount}>{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {setTagFilter && (
            <>
              <div className={s.filterDivider} />

              <div className={s.filterSection}>
                <span className={s.filterLabel}>
                  {t("database.physicalTag")}
                </span>
                <div className={s.filters}>
                  {[
                    [
                      TAG_FILTER.ALL,
                      t("database.all"),
                      counts.tagWith + counts.tagWithout,
                    ],
                    [TAG_FILTER.WITH, t("database.tagWith"), counts.tagWith],
                    [
                      TAG_FILTER.WITHOUT,
                      t("database.tagWithout"),
                      counts.tagWithout,
                    ],
                  ].map(([id, label, count]) => {
                    const isActive = tagFilter === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
                        aria-pressed={isActive}
                        onClick={() => setTagFilter(id)}
                      >
                        {label}
                        {count > 0 && (
                          <span className={s.filterCount}>{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {hasGps && (
            <>
              <div className={s.filterDivider} />
              <button
                className={`${s.nearbyToggle} ${
                  nearbyFilter ? s.nearbyToggleActive : ""
                }`}
                onClick={() => setNearbyFilter((value) => !value)}
              >
                <span className={s.nearbyLeft}>
                  <span className={s.nearbyIcon}>📌</span>
                  <span className={s.nearbyLabel}>{t("database.nearMe")}</span>
                  {counts.nearby > 0 && (
                    <span className={s.nearbyCount}>{counts.nearby}</span>
                  )}
                </span>
                <span
                  className={`${s.nearbyTrack} ${
                    nearbyFilter ? s.nearbyTrackOn : ""
                  }`}
                >
                  <span
                    className={`${s.nearbyThumb} ${
                      nearbyFilter ? s.nearbyThumbOn : ""
                    }`}
                  />
                </span>
              </button>
              {nearbyFilter && (
                <div className={s.nearbyRadiusGroup}>
                  {nearbyRadiusOptions.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      className={`${s.nearbyRadiusBtn} ${
                        nearbyRadius === radius ? s.nearbyRadiusBtnActive : ""
                      }`}
                      onClick={() => setNearbyRadius(radius)}
                    >
                      {formatRadius(radius)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

export default memo(FilterBar);

function FilterTab({
  id,
  label,
  count,
  active,
  onSelect,
  color = /** @type {string|null} */ (null),
  bg = /** @type {string|null} */ (null),
  border = /** @type {string|null} */ (null),
}) {
  const isActive = active;
  // Синий по умолчанию даёт класс filterActive. Инлайновый стиль нужен только
  // состояниям со своим цветом — «устранена» зелёная, и подменять её общим
  // синим значило бы терять этот признак.
  const activeStyle =
    isActive && color
      ? { color, background: bg ?? undefined, borderColor: border ?? undefined }
      : undefined;

  return (
    <button
      className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
      style={activeStyle}
      onClick={() =>
        onSelect((current) => {
          if (id === ALL) return [];
          return toggleSelected(current, id);
        })
      }
    >
      {label}
      {count > 0 && <span className={s.filterCount}>{count}</span>}
    </button>
  );
}
