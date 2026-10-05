import { lazy, Suspense, useMemo } from "react";
import { useMainPageActions } from "./hooks/useMainPageActions";
import CoverageCard from "./components/CoverageCard";
import EmptyState from "./components/EmptyState";
import { groupRecentLeaks } from "./recentGroups";
import RepairAnalytics from "./components/RepairAnalytics";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import { STATUS } from "@/utils/status";
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
  coverage = /** @type {any} */ (null),
}) {
  const { t } = useLanguage();

  const {
    activeLeak,
    setActiveLeak,
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
    handlePickStatus,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleSaveLeak,
    handleDeleteLeak,
  } = useMainPageActions({ data, scopedData, setData, userProfile });

  const groups = useMemo(() => groupRecentLeaks(recent), [recent]);

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {coverage && <CoverageCard coverage={coverage} />}

      <RepairAnalytics leaks={scopedData} onOpenLeak={setActiveLeak} />

      {recent.length ? (
        groups.map((group, index) => (
          <section key={group.key} className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>
                {t(`mainPage.groups.${group.key}`)}
              </h2>
              {/* Counts the selected location, not the project: the button
                  leads to the database, which is scoped too, so a
                  project-wide number would promise records that screen will
                  not show. */}
              {index === 0 && stats.total > RECENT_COUNT && (
                <button className={s.viewAll} onClick={() => setPage("db")}>
                  {t("mainPage.showAll", { count: stats.total })}
                </button>
              )}
            </div>

            <div className={s.list}>
              {group.leaks.map((leak) => (
                <LeakCardCompact
                  key={leak.id}
                  leak={leak}
                  onOpenDetails={setActiveLeak}
                  onPickStatus={handlePickStatus}
                  onMonitor={onMonitorLeak}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState setPage={setPage} />
      )}

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
