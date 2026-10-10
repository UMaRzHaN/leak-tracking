import { lazy, Suspense, useMemo, useState } from "react";
import { useMainPageActions } from "./hooks/useMainPageActions";
import CoverageCard from "./components/CoverageCard";
import FilterChips from "@/components/ui/FilterChips/FilterChips";
import EmptyState from "./components/EmptyState";
import { groupRecentLeaks } from "./recentGroups";
import RepairAnalytics from "./components/RepairAnalytics";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import Notification from "@/components/ui/Notification/Notification";
import { STATUS } from "@/utils/status";
import {
  countRepairStages,
  getRepairLeaks,
  getRepairStage,
} from "@/domain/repairStages";
import {
  REPAIR_STAGE_ORDER,
  getRepairStageMeta,
  splitMaterials,
} from "@/utils/repairStage";
import { useLanguage } from "@/app/hooks/useLanguage";
import { MODULE } from "@/app/modules/activeModule";
import { useCanCheckRepair } from "@/pages/Repairs/useCanCheckRepair";
import s from "./MainPage.module.scss";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);

export default function MainPage({
  setPage,
  data,
  scopedData,
  setData,
  onMonitorLeak,
  userProfile,
  coverage = /** @type {any} */ (null),
  module = /** @type {string} */ (MODULE.LDAR),
}) {
  const { t } = useLanguage();

  // Журнал ремонтов (7a) — те же записи с чипами по стадии работ вместо
  // статуса: ожидают МТР, в ремонте, устранены.
  const repairMode = module === MODULE.REPAIRS;
  const canCheckRepair = useCanCheckRepair(repairMode);
  const [stageFilter, setStageFilter] = useState("all");
  const source = scopedData ?? data;
  const repairLeaks = useMemo(
    () => (repairMode ? getRepairLeaks(source) : null),
    [repairMode, source],
  );
  const stageCounts = useMemo(
    () => (repairLeaks ? countRepairStages(repairLeaks) : null),
    [repairLeaks],
  );
  const listData = useMemo(() => {
    if (!repairLeaks) return source;
    return stageFilter === "all"
      ? repairLeaks
      : repairLeaks.filter((leak) => getRepairStage(leak) === stageFilter);
  }, [repairLeaks, source, stageFilter]);

  const {
    activeLeak,
    setActiveLeak,
    statusFilter,
    setStatusFilter,
    notification,
    setNotification,
    stats,
    recent,
    RECENT_COUNT,
    ALL,
    handleSaveLeak,
    handleDeleteLeak,
  } = useMainPageActions({
    data,
    scopedData: listData,
    setData,
  });

  const groups = useMemo(() => groupRecentLeaks(recent), [recent]);

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {repairMode ? (
        <FilterChips
          label={t("repairs.chipsLabel")}
          all={{
            key: "all",
            label: t("repairs.all"),
            count: stageCounts?.all ?? 0,
          }}
          items={REPAIR_STAGE_ORDER.map((stage) => ({
            key: stage,
            label: t(`repairs.stages.${stage}`),
            count: stageCounts?.[stage] ?? 0,
            dot: getRepairStageMeta(stage, t).dot,
          }))}
          value={stageFilter}
          onChange={setStageFilter}
        />
      ) : module === MODULE.MONITORING ? (
        <FilterChips
          label={t("mainPage.chips.label")}
          all={{ key: ALL, label: t("mainPage.chips.all"), count: stats.total }}
          items={[
            [STATUS.OPEN, "open", stats.open, "var(--c-open)"],
            [
              STATUS.IN_PROGRESS,
              "inProgress",
              stats.inProgress,
              "var(--c-progress)",
            ],
            [STATUS.RESOLVED, "resolved", stats.resolved, "var(--c-resolved)"],
          ].map(([key, label, count, dot]) => ({
            key,
            label: t(`mainPage.chips.${label}`),
            count,
            dot,
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      ) : (
        <>
          {coverage && (
            <CoverageCard
              coverage={coverage}
              onOpen={() => setPage("coverage")}
            />
          )}
          <RepairAnalytics leaks={scopedData} onOpenLeak={setActiveLeak} />
        </>
      )}

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
                  badge={
                    repairMode
                      ? getRepairStageMeta(getRepairStage(leak), t)
                      : null
                  }
                  extraChips={
                    repairMode ? splitMaterials(leak.materials_equipment) : []
                  }
                  onOpenDetails={setActiveLeak}
                  // В ремонтах свайп влево — проверка ремонта, и у принятого
                  // тоже; в идущем обходе — кроме принятых до него.
                  onMonitor={canCheckRepair(leak) ? onMonitorLeak : undefined}
                  monitorLabel={repairMode ? t("repairs.checkSwipe") : null}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          setPage={setPage}
          // Во время обхода утечек не заводят — предлагать это пустой список
          // мониторинга не должен.
          canAdd={module === MODULE.LDAR}
          hasFilter={repairMode ? stageFilter !== "all" : statusFilter !== ALL}
        />
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
      </Suspense>
    </div>
  );
}
