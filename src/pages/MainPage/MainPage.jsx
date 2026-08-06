import { lazy, Suspense, useMemo } from "react";
import { useMainPageActions } from "./hooks/useMainPageActions";
import StatCard from "./components/StatCard";
import EmptyState from "./components/EmptyState";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import { STATUS, STATUS_META, getStatusMeta } from "@/utils/status";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./MainPage.module.scss";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);
const StatusPickerModal = lazy(
  () => import("@/features/status/StatusPickerModal/StatusPickerModal"),
);
const ResolveModal = lazy(
  () => import("@/features/resolve/ResolveModal/ResolveModal"),
);
const ReopenLeakModal = lazy(
  () => import("@/features/status/ReopenLeakModal/ReopenLeakModal"),
);

export default function MainPage({
  setPage,
  data,
  scopedData,
  setData,
  onMonitorLeak,
  userProfile,
}) {
  const { t } = useLanguage();

  const {
    activeLeak,
    setActiveLeak,
    statusFilter,
    setStatusFilter,
    pickerLeak,
    setPickerLeak,
    resolveLeak,
    setResolveLeak,
    repairLeak,
    setRepairLeak,
    reopenLeak,
    setReopenLeak,
    vars,
    notification,
    setNotification,
    stats,
    recent,
    RECENT_COUNT,
    ALL,
    toggleFilter,
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleSaveLeak,
    handleDeleteLeak,
  } = useMainPageActions({ data, scopedData, setData, userProfile });

  const localeTexts = useMemo(
    () => ({
      total: t("mainPage.total"),
      open: t("mainPage.open"),
      inProgress: t("mainPage.inProgress"),
      resolved: t("mainPage.resolved"),
      recentRecords: t("mainPage.recentRecords", {
        count: RECENT_COUNT,
      }),
      showAll: (count) =>
        t("mainPage.showAll", {
          count,
        }),
      shownRecent: t("mainPage.shownRecent", {
        count: RECENT_COUNT,
      }),
    }),
    [RECENT_COUNT, t],
  );

  const activeStatusMeta =
    statusFilter !== ALL ? getStatusMeta(statusFilter, t) : null;

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <section className={s.statsRow}>
        <StatCard
          value={stats.total}
          label={localeTexts.total}
          accent="var(--c-blue)"
          active={statusFilter === ALL}
          onClick={() => setStatusFilter(ALL)}
        />
        <StatCard
          value={stats.open}
          label={localeTexts.open}
          accent="var(--c-open)"
          active={statusFilter === STATUS.OPEN}
          onClick={() => toggleFilter(STATUS.OPEN)}
        />
        <StatCard
          value={stats.inProgress}
          label={localeTexts.inProgress}
          accent="var(--c-progress)"
          active={statusFilter === STATUS.IN_PROGRESS}
          onClick={() => toggleFilter(STATUS.IN_PROGRESS)}
        />
        <StatCard
          value={stats.resolved}
          label={localeTexts.resolved}
          accent="var(--c-resolved)"
          active={statusFilter === STATUS.RESOLVED}
          onClick={() => toggleFilter(STATUS.RESOLVED)}
        />
      </section>

      {activeStatusMeta && (
        <div className={s.filterLabel}>
          <span
            className={s.filterDot}
            style={{ background: STATUS_META[statusFilter]?.color }}
          />
          {activeStatusMeta.label} - {localeTexts.shownRecent}
          <button
            className={s.filterClear}
            onClick={() => setStatusFilter(ALL)}
          >
            ✕
          </button>
        </div>
      )}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            {statusFilter === ALL
              ? localeTexts.recentRecords
              : activeStatusMeta?.label}
          </h2>
          {/* Counts the selected location, not the project: the button leads
              to the database, which is scoped too, so a project-wide number
              would promise records that screen will not show. stats.total is
              the same count the summary tile above displays. */}
          {stats.total > RECENT_COUNT && (
            <button className={s.viewAll} onClick={() => setPage("db")}>
              {localeTexts.showAll(stats.total)}
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
              onMonitor={onMonitorLeak}
            />
          ))
        ) : (
          <EmptyState setPage={setPage} hasFilter={statusFilter !== ALL} />
        )}
      </section>

      <Suspense fallback={null}>
        {activeLeak && (
          <LeakDetailsSheet
            leak={activeLeak}
            allLeaks={data}
            onClose={() => setActiveLeak(null)}
            onSave={handleSaveLeak}
            onDelete={handleDeleteLeak}
            userProfile={userProfile}
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

        {repairLeak && (
          <ResolveModal
            leak={repairLeak}
            mode="repair"
            onConfirm={handleRepairConfirm}
            onClose={() => setRepairLeak(null)}
          />
        )}

        {reopenLeak && (
          <ReopenLeakModal
            leak={reopenLeak}
            vars={vars}
            onConfirm={handleReopenConfirm}
            onClose={() => setReopenLeak(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
