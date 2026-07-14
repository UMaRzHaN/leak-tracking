import { useState, memo } from "react";
import { STATUS_META, STATUS_ORDER, getStatusMeta } from "@/utils/status";
import { PRIORITY_ORDER, getPriorityMeta } from "@/utils/priority";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";

const ALL = "all";

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
  statusFilter,
  setFilter,
  priorityFilter,
  setPriorityFilter,
  nearbyFilter,
  setNearbyFilter,
  nearbyRadius,
  setNearbyRadius,
  nearbyRadiusOptions,
  counts,
  hasGps,
}) {
  const { t, lang } = useLanguage();
  const selectedStatuses = normalizeSelected(statusFilter);
  const selectedPriorities = normalizeSelected(priorityFilter);
  const hasActiveFilter =
    selectedStatuses.length > 0 ||
    selectedPriorities.length > 0 ||
    nearbyFilter;
  const [open, setOpen] = useState(false);
  const formatRadius = (radius) =>
    radius >= 1000
      ? `${radius / 1000} ${lang === "ru" ? "км" : "km"}`
      : `${radius} ${lang === "ru" ? "м" : "m"}`;

  return (
    <>
      <div className={s.searchRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            placeholder={
              lang === "ru"
                ? "Поиск по ID, объекту, описанию..."
                : "Search by ID, object, description..."
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              className={s.clearSearch}
              onClick={() => setSearch("")}
              type="button"
            >
              ✕
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
          <div className={s.filterSection}>
            <span className={s.filterLabel}>
              {lang === "ru" ? "Статус" : "Status"}
            </span>
            <div className={s.filters}>
              <FilterTab
                id={ALL}
                label={lang === "ru" ? "Все" : "All"}
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
            <span className={s.filterLabel}>
              {lang === "ru" ? "Приоритет" : "Priority"}
            </span>
            <div className={s.priorityFilters}>
              <button
                className={`${s.priorityTab} ${
                  selectedPriorities.length === 0 ? s.priorityTabActive : ""
                }`}
                style={
                  selectedPriorities.length === 0
                    ? {
                        color: "var(--c-blue)",
                        background: "var(--c-blue-dim)",
                        borderColor: "var(--c-blue)",
                      }
                    : undefined
                }
                onClick={() => setPriorityFilter([])}
              >
                {lang === "ru" ? "Все" : "All"}
              </button>
              {PRIORITY_ORDER.map((priority) => {
                const meta = getPriorityMeta(priority, t, lang);
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
                  <span className={s.nearbyLabel}>
                    {lang === "ru" ? "Рядом со мной" : "Near me"}
                  </span>
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

function FilterTab({ id, label, count, active, onSelect, color, bg, border }) {
  const isActive = active;
  const activeStyle = isActive
    ? color
      ? { color, background: bg, borderColor: border }
      : {
          color: "var(--c-blue)",
          background: "var(--c-blue-dim)",
          borderColor: "var(--c-blue)",
        }
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
