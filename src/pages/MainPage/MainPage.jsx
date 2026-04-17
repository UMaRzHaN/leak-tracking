import { useState, useMemo } from "react";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import { STATUS, STATUS_META } from "../../utils/status";
import { nextStatus } from "../../utils/status";
import { hapticSuccess } from "../../utils/haptics";
import s from "./MainPage.module.scss";

const RECENT_COUNT = 8;
const ALL = "all";

export default function MainPage({ setPage, data, setData }) {
  const [activeLeak, setActiveLeak]     = useState(null);
  const [statusFilter, setStatusFilter] = useState(ALL);

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

  /* ── Status change via swipe ── */
  const handleStatusChange = async (id) => {
    const next = data.map((r) =>
      r.id === id ? { ...r, status: nextStatus(r.status) } : r
    );
    await setData(next);
    hapticSuccess();
  };

  const handleSaveLeak = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    await setData(next);
    hapticSuccess();
    setActiveLeak(null);
  };

  const handleDeleteLeak = async (id) => {
    const next = data.filter((r) => r.id !== id);
    await setData(next);
    hapticSuccess();
    setActiveLeak(null);
  };

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

        {recent.length ? (
          recent.map((leak) => (
            <LeakCardCompact
              key={leak.id}
              leak={leak}
              onOpenDetails={setActiveLeak}
              onStatusChange={handleStatusChange}
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
          onDelete={handleDeleteLeak}
        />
      )}
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
