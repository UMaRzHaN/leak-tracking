import { useState, useMemo, useCallback } from "react";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import StatusPickerModal from "../../components/StatusPickerModal/StatusPickerModal";
import ResolveModal from "../../components/ResolveModal/ResolveModal";
import Notification from "../../components/Notification/Notification";
import { STATUS, STATUS_META } from "../../utils/status";
import { useProjectData } from "../../app/hooks/useProjectData";
import { hapticSuccess } from "../../utils/haptics";
import s from "./MainPage.module.scss";

const RECENT_COUNT = 8;
const ALL = "all";

export default function MainPage({ setPage, data, setData }) {
  const [activeLeak, setActiveLeak]       = useState(null);
  const [statusFilter, setStatusFilter]   = useState(ALL);
  const [pickerLeak, setPickerLeak]       = useState(null);
  const [resolveLeak, setResolveLeak]     = useState(null);
  const [notification, setNotification]   = useState(null);

  const notify = useCallback((type, message) => setNotification({ type, message }), []);

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

  /* ── Swipe → open status picker ── */
  const handlePickStatus = useCallback((leak) => setPickerLeak(leak), []);

  const handleStatusSelect = useCallback(
    async (newStatus) => {
      const leak = pickerLeak;
      setPickerLeak(null);
      if (!leak || newStatus === leak.status) return;

      if (newStatus === STATUS.RESOLVED) {
        setResolveLeak(leak);
        return;
      }

      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              status: newStatus,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: newStatus, date: new Date().toISOString() },
              ],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, pickerLeak, save, setData],
  );

  const handleResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveLeak;
      setResolveLeak(null);
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              photo_after: photo_after ?? r.photo_after,
              materials_equipment: materials_equipment ?? r.materials_equipment,
              note: note ?? r.note,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: STATUS.RESOLVED, date: now },
              ],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, resolveLeak, save, setData],
  );

  const handleSaveLeak = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    try {
      await setData(next);
      hapticSuccess();
      setActiveLeak(null);
    } catch (err) {
      notify("error", "Ошибка сохранения: " + err.message);
    }
  };

  const handleDeleteLeak = async (id) => {
    const next = data.filter((r) => r.id !== id);
    try {
      await setData(next);
      hapticSuccess();
      setActiveLeak(null);
    } catch (err) {
      notify("error", "Ошибка удаления: " + err.message);
    }
  };

  return (
    <div className={s.page}>
      <Notification notification={notification} onClose={() => setNotification(null)} />

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
            {statusFilter === ALL ? "Последние 8 записей" : STATUS_META[statusFilter]?.label}
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
              onPickStatus={handlePickStatus}
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

      {pickerLeak && (
        <StatusPickerModal
          current={pickerLeak.status ?? STATUS.OPEN}
          onSelect={handleStatusSelect}
          onClose={() => setPickerLeak(null)}
        />
      )}

      {resolveLeak && (
        <ResolveModal
          leak={resolveLeak}
          onConfirm={handleResolveConfirm}
          onClose={() => setResolveLeak(null)}
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
