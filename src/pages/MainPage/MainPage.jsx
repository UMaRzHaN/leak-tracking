import { useMainPageActions } from "./hooks/useMainPageActions";
import StatCard from "./components/StatCard";
import EmptyState from "./components/EmptyState";
import LeakDetailsSheet from "@/features/leakDetails/LeakDetailsSheet";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import StatusPickerModal from "@/features/status/StatusPickerModal/StatusPickerModal";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import Notification from "@/components/ui/Notification/Notification";
import { STATUS, STATUS_META } from "@/utils/status";
import s from "./MainPage.module.scss";

export default function MainPage({ setPage, data, setData }) {
  const {
    activeLeak, setActiveLeak,
    statusFilter, setStatusFilter,
    pickerLeak, setPickerLeak,
    resolveLeak, setResolveLeak,
    notification, setNotification,
    stats, recent, RECENT_COUNT, ALL,
    toggleFilter,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleSaveLeak,
    handleDeleteLeak,
  } = useMainPageActions({ data, setData });

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

      {/* ── Active filter label ── */}
      {statusFilter !== ALL && (
        <div className={s.filterLabel}>
          <span
            className={s.filterDot}
            style={{ background: STATUS_META[statusFilter]?.color }}
          />
          {STATUS_META[statusFilter]?.label} — показаны последние {RECENT_COUNT}
          <button className={s.filterClear} onClick={() => setStatusFilter(ALL)}>
            ✕
          </button>
        </div>
      )}

      {/* ── Recent leaks ── */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            {statusFilter === ALL
              ? "Последние 8 записей"
              : STATUS_META[statusFilter]?.label}
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
