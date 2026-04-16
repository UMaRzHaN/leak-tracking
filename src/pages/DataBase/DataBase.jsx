import { useState, useMemo, useCallback } from "react";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import UndoToast from "../../components/UndoToast/UndoToast";
import { useUndoDelete } from "../../hooks/useUndoDelete";
import { STATUS, STATUS_META, STATUS_ORDER } from "../../utils/status";
import { hapticSuccess, hapticWarning } from "../../utils/haptics";
import { filterNearbyLeaks } from "../../utils/geoUtils";
import { exportToExcel } from "../../utils/exportExcel";
import { useProjectData } from "../../app/hooks/useProjectData";
import s from "./DataBase.module.scss";

const ALL = "all";
const NEARBY = "nearby";
const NEARBY_RADIUS_M = 500;

const EXPORT_HEADERS = ["ID", "Объект", "Компонент", "Местоположение", "Поле", "Статус", "Давление (атм)", "Описание", "Дата"];
const EXPORT_KEYS    = ["leak_id", "object", "component", "location", "field", "status", "pressure", "leak_description", "created_at"];

function handleExport(data) {
  const rows = data.map((r) => ({
    ...r,
    status: r.status ?? "open",
    created_at: r.created_at ? new Date(Number(r.created_at)).toLocaleDateString("ru-RU") : "",
  }));
  exportToExcel(rows, EXPORT_HEADERS, EXPORT_KEYS, "утечки");
}

export default function DataBase({ data, setData, coords }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [search, setSearch]         = useState("");
  const [statusFilter, setFilter]   = useState(ALL);
  const { save } = useProjectData();

  const hasGps = Boolean(coords?.lat && coords?.lng);

  /* ── Filter + sort strictly by date desc ── */
  const displayed = useMemo(() => {
    // Nearby filter uses its own sorted list (by distance)
    if (statusFilter === NEARBY) {
      let list = hasGps
        ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M)
        : [];
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter((l) =>
          [l.leak_id, l.object, l.component, l.location, l.field, l.leak_description]
            .some((v) => v?.toLowerCase().includes(q)),
        );
      }
      return list;
    }

    let list = [...data].sort((a, b) => b.id - a.id);

    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        [l.leak_id, l.object, l.component, l.location, l.field, l.leak_description]
          .some((v) => v?.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [data, statusFilter, search, hasGps, coords]);

  /* ── Undo delete ── */
  const [deletedItems, setDeletedItems] = useState({});

  const { pending, schedule, undo } = useUndoDelete({
    onConfirm: async ({ id }) => {
      const row = deletedItems[id];
      if (!row) return;
      const next = data.filter((r) => r.id !== id).map((r, i) => ({ ...r, index: i + 1 }));
      await save(next);
      setDeletedItems((p) => { const c = { ...p }; delete c[id]; return c; });
    },
  });

  const handleRemove = useCallback((id) => {
    const row = data.find((r) => r.id === id);
    if (!row) return;
    setDeletedItems((p) => ({ ...p, [id]: row }));
    hapticWarning();
    schedule({ id, label: row.leak_id ?? String(row.index) });
  }, [data, schedule]);

  const handleUndo = () => { undo(); hapticSuccess(); };

  /* ── Save from details ── */
  const handleSave = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    setData(next);
    await save(next);
    hapticSuccess();
    setActiveLeak(null);
  };

  const visible = displayed.filter((l) => !deletedItems[l.id]);

  /* ── Status counts for filter tabs ── */
  const counts = useMemo(() => {
    const c = { all: data.length };
    STATUS_ORDER.forEach((st) => {
      c[st] = data.filter((l) => (l.status ?? STATUS.OPEN) === st).length;
    });
    c[NEARBY] = hasGps
      ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M).length
      : 0;
    return c;
  }, [data, hasGps, coords]);

  return (
    <div className={s.page}>

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
          <button className={s.clearSearch} onClick={() => setSearch("")}>✕</button>
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

      {/* ── Results info + Export ── */}
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visible.length > 0
            ? statusFilter === NEARBY
              ? `${visible.length} ${pluralLeaks(visible.length)} • в радиусе ${NEARBY_RADIUS_M} м`
              : `${visible.length} ${pluralLeaks(visible.length)} • дата ↓`
            : null}
        </span>
        {data.length > 0 && (
          <button
            className={s.exportBtn}
            onClick={() => handleExport(displayed)}
            title="Экспорт в Excel"
          >
            📥 XLSX
          </button>
        )}
      </div>

      {/* ── List ── */}
      <div className={s.list}>
        {visible.length ? (
          visible.map((leak) => (
            <LeakCardCompact
              key={leak.id}
              leak={leak}
              onOpenDetails={setActiveLeak}
              onRemove={handleRemove}
              nearbyDist={leak._nearbyDist}
            />
          ))
        ) : (
          <div className={s.empty}>
            <span>📭</span>
            <p>
              {search
                ? "Ничего не найдено"
                : statusFilter === NEARBY
                ? `Нет утечек в радиусе ${NEARBY_RADIUS_M} м`
                : "Записей нет"}
            </p>
          </div>
        )}
      </div>

      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={handleSave}
        />
      )}

      <UndoToast pending={pending} onUndo={handleUndo} />
    </div>
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

function pluralLeaks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "записи";
  return "записей";
}
