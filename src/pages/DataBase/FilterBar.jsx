import { STATUS_META, STATUS_ORDER } from "../../utils/status";
import { PRIORITY_ORDER, PRIORITY_META } from "../../utils/priority";
import s from "./DataBase.module.scss";

const ALL = "all";
const NEARBY = "nearby";

export default function FilterBar({
  search,
  setSearch,
  statusFilter,
  setFilter,
  priorityFilter,
  setPriorityFilter,
  counts,
  hasGps,
}) {
  return (
    <>
      {/* ── Search ── */}
      <div className={s.searchWrap}>
        <span className={s.searchIcon}>🔍</span>
        <input
          className={s.searchInput}
          placeholder="Поиск по ID, объекту, описанию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className={s.clearSearch} onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {/* ── Status filter tabs ── */}
      <div className={s.filters}>
        <FilterTab id={ALL} label="Все" count={counts.all} active={statusFilter} onSelect={setFilter} />
        {STATUS_ORDER.map((st) => (
          <FilterTab
            key={st}
            id={st}
            label={STATUS_META[st].short}
            count={counts[st]}
            active={statusFilter}
            onSelect={setFilter}
            color={STATUS_META[st].color}
          />
        ))}
        {hasGps && (
          <FilterTab
            id={NEARBY}
            label="📍 Рядом"
            count={counts[NEARBY]}
            active={statusFilter}
            onSelect={setFilter}
            color="var(--c-blue)"
          />
        )}
      </div>

      {/* ── Priority filter ── */}
      <div className={s.priorityFilters}>
        <button
          className={`${s.priorityTab} ${priorityFilter === ALL ? s.priorityTabActive : ""}`}
          onClick={() => setPriorityFilter(ALL)}
        >
          Все приоритеты
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
    </>
  );
}

function FilterTab({ id, label, count, active, onSelect, color }) {
  const isActive = active === id;
  return (
    <button
      className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
      style={isActive && color ? { borderColor: color, color } : undefined}
      onClick={() => onSelect(id)}
    >
      {label}
      {count > 0 && <span className={s.filterCount}>{count}</span>}
    </button>
  );
}
