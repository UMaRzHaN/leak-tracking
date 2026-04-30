import { useState, useEffect, memo } from "react";
import { STATUS_META, STATUS_ORDER } from "../../../utils/status";
import { PRIORITY_ORDER, PRIORITY_META } from "../../../utils/priority";
import s from "../DataBase.module.scss";

const ALL = "all";

function FilterBar({
  search,
  setSearch,
  statusFilter,
  setFilter,
  priorityFilter,
  setPriorityFilter,
  nearbyFilter,
  setNearbyFilter,
  counts,
  hasGps,
}) {
  const hasActiveFilter = statusFilter !== ALL || priorityFilter !== ALL || nearbyFilter;
  const [open, setOpen] = useState(hasActiveFilter);

  useEffect(() => {
    if (hasActiveFilter) setOpen(true);
  }, [hasActiveFilter]);

  return (
    <>
      <div className={s.searchRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            placeholder="Поиск по ID, объекту, описанию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={s.clearSearch} onClick={() => setSearch("")} type="button">
              ✕
            </button>
          )}
        </div>
        <button
          className={`${s.filterToggleBtn} ${open ? s.filterToggleBtnOpen : ""}`}
          onClick={(e) => { setOpen((v) => !v); if (open) e.currentTarget.blur(); }}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
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
            <span className={s.filterLabel}>Статус</span>
            <div className={s.filters}>
              <FilterTab
                id={ALL}
                label="Все"
                count={counts.all}
                active={statusFilter}
                onSelect={setFilter}
              />
              {STATUS_ORDER.map((st) => (
                <FilterTab
                  key={st}
                  id={st}
                  label={STATUS_META[st].short}
                  count={counts[st]}
                  active={statusFilter}
                  onSelect={setFilter}
                  color={STATUS_META[st].color}
                  bg={STATUS_META[st].bg}
                  border={STATUS_META[st].border}
                />
              ))}
            </div>
          </div>

          <div className={s.filterDivider} />

          <div className={s.filterSection}>
            <span className={s.filterLabel}>Приоритет</span>
            <div className={s.priorityFilters}>
              <button
                className={`${s.priorityTab} ${priorityFilter === ALL ? s.priorityTabActive : ""}`}
                style={priorityFilter === ALL ? { color: "var(--c-blue)", background: "var(--c-blue-dim)", borderColor: "var(--c-blue)" } : undefined}
                onClick={() => setPriorityFilter(ALL)}
              >
                Все
              </button>
              {PRIORITY_ORDER.map((p) => {
                const m = PRIORITY_META[p];
                const isActive = priorityFilter === p;
                return (
                  <button
                    key={p}
                    className={`${s.priorityTab} ${isActive ? s.priorityTabActive : ""}`}
                    style={isActive ? { borderColor: m.border, color: m.color, background: m.bg } : undefined}
                    onClick={() => setPriorityFilter(isActive ? ALL : p)}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>
          </div>

          {hasGps && (
            <>
              <div className={s.filterDivider} />
              <button
                className={`${s.nearbyToggle} ${nearbyFilter ? s.nearbyToggleActive : ""}`}
                onClick={() => setNearbyFilter((v) => !v)}
              >
                <span className={s.nearbyLeft}>
                  <span className={s.nearbyIcon}>📍</span>
                  <span className={s.nearbyLabel}>Рядом со мной</span>
                  {counts["nearby"] > 0 && (
                    <span className={s.nearbyCount}>{counts["nearby"]}</span>
                  )}
                </span>
                <span className={`${s.nearbyTrack} ${nearbyFilter ? s.nearbyTrackOn : ""}`}>
                  <span className={`${s.nearbyThumb} ${nearbyFilter ? s.nearbyThumbOn : ""}`} />
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default memo(FilterBar);

function FilterTab({ id, label, count, active, onSelect, color, bg, border }) {
  const isActive = active === id;
  const activeStyle = isActive
    ? color
      ? { color, background: bg, borderColor: border }
      : { color: "var(--c-blue)", background: "var(--c-blue-dim)", borderColor: "var(--c-blue)" }
    : undefined;

  return (
    <button
      className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
      style={activeStyle}
      onClick={() => onSelect(id)}
    >
      {label}
      {count > 0 && <span className={s.filterCount}>{count}</span>}
    </button>
  );
}
