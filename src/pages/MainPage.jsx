import { useState, useMemo } from "react";
import LeakDetailsSheet from "../components/LeakDetailsSheet/LeakDetailsSheet";
import LeakCardCompact from "../components/LeakCardCompact/LeakCardCompact";
import UndoToast from "../components/UndoToast/UndoToast";
import { useUndoDelete } from "../hooks/useUndoDelete";
import { useProjectData } from "../app/hooks/useProjectData";
import { STATUS, STATUS_META } from "../utils/status";
import { hapticSuccess, hapticWarning } from "../utils/haptics";
import s from "./MainPage.module.scss";

const RECENT_COUNT = 8;
const ALL = "all";

export default function MainPage({ setPage, data, setData }) {
  const [activeLeak, setActiveLeak]   = useState(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const { save } = useProjectData();

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:      data.length,
    open:       data.filter((l) => (l.status ?? STATUS.OPEN) === STATUS.OPEN).length,
    inProgress: data.filter((l) => l.status === STATUS.IN_PROGRESS).length,
    resolved:   data.filter((l) => l.status === STATUS.RESOLVED).length,
  }), [data]);

  /* ── Toggle status filter ── */
  const toggleFilter = (key) =>
    setStatusFilter((prev) => (prev === key ? ALL : key));

  /* ── Filtered recent: newest first ── */
  const recent = useMemo(() => {
    let list = [...data].sort((a, b) => b.id - a.id);
    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }
    return list.slice(0, RECENT_COUNT);
  }, [data, statusFilter]);

  /* ── Undo delete ── */
  const [deletedItems, setDeletedItems] = useState({});

  const { pending, schedule, undo } = useUndoDelete({
    onConfirm: async ({ id }) => {
      const row = deletedItems[id];
      if (!row) return;
      const next = data.filter((r) => r.id !== id).map((r, i) => ({ ...r, index: i + 1 }));
      await save(next);
      setDeletedItems((prev) => { const c = { ...prev }; delete c[id]; return c; });
    },
  });

  const handleRemove = (id) => {
    const row = data.find((r) => r.id === id);
    if (!row) return;
    setDeletedItems((prev) => ({ ...prev, [id]: row }));
    hapticWarning();
    schedule({ id, label: row.leak_id ?? String(row.index) });
  };

  const handleSaveLeak = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    setData(next);
    await save(next);
    hapticSuccess();
    setActiveLeak(null);
  };

  const visibleRecent = recent.filter((l) => !deletedItems[l.id]);

  return (
    <div className={s.page}>

      {/* ── Statistics (clickable filters) ── */}
      <section className={s.statsRow}>
        <StatCard
          value={stats.total}
          label="Всего"
          accent="var(--c-blue)"
          active={statusFilter === ALL}
          onClick={() => setStatusFilter(ALL)}
        />
        <StatCard
          value={stats.open}
          label="Открыто"
          accent="var(--c-open)"
          active={statusFilter === STATUS.OPEN}
          onClick={() => toggleFilter(STATUS.OPEN)}
        />
        <StatCard
          value={stats.inProgress}
          label="В работе"
          accent="var(--c-progress)"
          active={statusFilter === STATUS.IN_PROGRESS}
          onClick={() => toggleFilter(STATUS.IN_PROGRESS)}
        />
        <StatCard
          value={stats.resolved}
          label="Устранено"
          accent="var(--c-resolved)"
          active={statusFilter === STATUS.RESOLVED}
          onClick={() => toggleFilter(STATUS.RESOLVED)}
        />
      </section>

      {/* ── Filter label ── */}
      {statusFilter !== ALL && (
        <div className={s.filterLabel}>
          <span
            className={s.filterDot}
            style={{ background: STATUS_META[statusFilter]?.color }}
          />
          {STATUS_META[statusFilter]?.label} — показаны последние {RECENT_COUNT}
          <button className={s.filterClear} onClick={() => setStatusFilter(ALL)}>✕</button>
        </div>
      )}

      {/* ── Recent leaks ── */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            {statusFilter === ALL ? "Последние записи" : STATUS_META[statusFilter]?.label}
          </h2>
          {data.length > RECENT_COUNT && (
            <button className={s.viewAll} onClick={() => setPage("db")}>
              Все {data.length} →
            </button>
          )}
        </div>

        {visibleRecent.length ? (
          visibleRecent.map((leak) => (
            <LeakCardCompact
              key={leak.id}
              leak={leak}
              onOpenDetails={setActiveLeak}
              onRemove={handleRemove}
            />
          ))
        ) : (
          <EmptyState setPage={setPage} hasFilter={statusFilter !== ALL} />
        )}
      </section>

      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={handleSaveLeak}
        />
      )}

      <UndoToast pending={pending} onUndo={() => { undo(); hapticSuccess(); }} />
    </div>
  );
}

/* ── StatCard ── */
function StatCard({ value, label, accent, active, onClick }) {
  return (
    <button
      className={`${s.statCard} ${active ? s.statActive : ""}`}
      style={{ "--accent": accent }}
      onClick={onClick}
    >
      <span className={s.statVal}>{value}</span>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statBar} />
    </button>
  );
}

function EmptyState({ setPage, hasFilter }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{hasFilter ? "🔍" : "📋"}</span>
      <p className={s.emptyTitle}>{hasFilter ? "Нет записей с таким статусом" : "Записей пока нет"}</p>
      {!hasFilter && (
        <>
          <p className={s.emptyHint}>Добавьте первую утечку через кнопку + внизу</p>
          <button className={s.emptyBtn} onClick={() => setPage("add")}>+ Добавить утечку</button>
        </>
      )}
    </div>
  );
}
