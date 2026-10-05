import { useMapPage } from "./hooks/useMapPage";
import { MAP_BASE } from "./mapBase";
import { useRenderMetric } from "@/utils/renderMetrics";
import MapControls from "./components/MapControls";
import TileProgress from "./components/TileProgress";
import MobileSheet from "@/components/ui/MobileSheet/MobileSheet";
import Notification from "@/components/ui/Notification/Notification";
import { useMemo, useState } from "react";
import RouteBanner from "@/features/route/RouteBanner";
import { componentStatusColor } from "@/domain/componentStatuses";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  countRepairStages,
  getRepairLeaks,
  getRepairStage,
} from "@/domain/repairStages";
import { REPAIR_STAGE_ORDER, getRepairStageMeta } from "@/utils/repairStage";
import s from "./MapPage.module.scss";

export default function MapPage({
  leaks,
  coords,
  gpsEnabled = true,
  sharedFilters,
  // Приходит из приложения: по ней шапка выбирает дерево мест. Хук ниже
  // отдаёт действующую базу — свою, если управляющей не передали.
  base: controlledBase,
  onBaseChange,
  // Активный маршрут обхода (5d): плашка сверху карты.
  routeProgress = /** @type {any} */ (null),
  onRouteCheck = /** @type {((leak: any) => void)|undefined} */ (undefined),
  onRouteEnd = /** @type {(() => void)|undefined} */ (undefined),
  // Карта модуля ремонтов (7i): только ремонты и чипы по стадии работ.
  repairMode = false,
  // Карта инвентаризации (6c): чипы по состоянию компонента.
  inventoryMode = false,
}) {
  useRenderMetric("MapPage");
  const { t } = useLanguage();
  const [stage, setStage] = useState("all");
  const repairLeaks = useMemo(
    () => (repairMode ? getRepairLeaks(leaks) : null),
    [repairMode, leaks],
  );
  const stageCounts = useMemo(
    () => (repairLeaks ? countRepairStages(repairLeaks) : null),
    [repairLeaks],
  );
  const shownLeaks = useMemo(() => {
    if (!repairLeaks) return leaks;
    return stage === "all"
      ? repairLeaks
      : repairLeaks.filter((leak) => getRepairStage(leak) === stage);
  }, [repairLeaks, leaks, stage]);

  const {
    containerRef,
    open,
    setOpen,
    notification,
    setNotification,
    tileProgress,
    downloading,
    visibleLeaks,
    base,
    setBase,
    componentsAvailable,
    showsComponents,
    componentStatus,
    monitoringFilter,
    hasMonitoringRound,
    activeProject,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions,
    fictionFilter,
    setFictionFilter,
    priorityFilters,
    statusFilters,
    hasGps,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters,
    toggleStatusFilter,
    clearStatusFilters,
    handleDownloadArea,
    cancelDownload,
    handleExportKML,
    focusLeak,
    locateMe,
  } = useMapPage({
    leaks: shownLeaks,
    coords,
    gpsEnabled,
    sharedFilters,
    base: controlledBase,
    onBaseChange,
  });

  return (
    <div className={s.mapWrapper}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div ref={containerRef} className={s.mapCanvas} />

      {stageCounts && !showsComponents && (
        <div
          className={s.stageChips}
          role="group"
          aria-label={t("repairs.chipsLabel")}
        >
          {["all", ...REPAIR_STAGE_ORDER].map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={stage === key}
              className={stage === key ? s.stageChipOn : s.stageChip}
              onClick={() => setStage(key)}
            >
              {key !== "all" && (
                <span
                  className={s.stageDot}
                  style={{ background: getRepairStageMeta(key, t).dot }}
                />
              )}
              {key === "all" ? t("repairs.all") : t(`repairs.stages.${key}`)}
              <span className={s.stageCount}>{stageCounts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {inventoryMode &&
        showsComponents &&
        componentStatus.statuses.length > 0 && (
          <div
            className={s.stageChips}
            role="group"
            aria-label={t("components.statusFilter")}
          >
            {["all", ...componentStatus.statuses].map((key) => {
              const active =
                key === "all"
                  ? componentStatus.selected.length === 0
                  : componentStatus.selected.length === 1 &&
                    componentStatus.selected[0] === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  className={active ? s.stageChipOn : s.stageChip}
                  onClick={() =>
                    componentStatus.onOnly(key === "all" ? null : key)
                  }
                >
                  {key !== "all" && (
                    <span
                      className={s.stageDot}
                      style={{ background: componentStatusColor(key) }}
                    />
                  )}
                  {key === "all" ? t("components.allStatuses") : key}
                  <span className={s.stageCount}>
                    {componentStatus.counts[key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}

      {routeProgress && !showsComponents && (
        <RouteBanner
          progress={routeProgress}
          coords={coords}
          gpsEnabled={gpsEnabled}
          onFocus={(leak) => focusLeak(leak, 17)}
          onCheck={(leak) => onRouteCheck?.(leak)}
          onEnd={() => onRouteEnd?.()}
        />
      )}

      <MapControls
        onLocate={locateMe}
        gpsEnabled={gpsEnabled}
        showsComponents={showsComponents}
        componentStatus={componentStatus}
        componentsAvailable={componentsAvailable}
        onToggleBase={() =>
          setBase(
            base === MAP_BASE.COMPONENTS ? MAP_BASE.LEAKS : MAP_BASE.COMPONENTS,
          )
        }
        onOpenSheet={() => setOpen(true)}
        onDownload={handleDownloadArea}
        onCancelDownload={cancelDownload}
        downloading={downloading}
        nearbyOnly={nearbyOnly}
        nearbyRadius={nearbyRadius}
        nearbyRadiusOptions={nearbyRadiusOptions}
        priorityFilters={priorityFilters}
        fictionFilter={fictionFilter}
        onFictionChange={setFictionFilter}
        statusFilters={statusFilters}
        monitoringFilter={monitoringFilter}
        hasMonitoringRound={hasMonitoringRound}
        hasGps={hasGps}
        onToggleNearby={(nextValue) =>
          setNearbyOnly((value) =>
            typeof nextValue === "boolean" ? nextValue : !value,
          )
        }
        onRadiusChange={(radius) => {
          setNearbyRadius(radius);
          setNearbyOnly(true);
        }}
        onPriorityToggle={togglePriorityFilter}
        onPriorityClear={clearPriorityFilters}
        onStatusToggle={toggleStatusFilter}
        onStatusClear={clearStatusFilters}
        onMonitoringChange={setMonitoringFilter}
      />

      {activeProject && visibleLeaks.length > 0 && (
        <div className={s.exportGroup}>
          <button
            type="button"
            className={s.exportBtn}
            onClick={handleExportKML}
          >
            ↗ KML
          </button>
        </div>
      )}

      <TileProgress progress={tileProgress} />

      <MobileSheet
        open={open}
        leaks={visibleLeaks}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          focusLeak(leak, 17);
          setOpen(false);
        }}
      />
    </div>
  );
}
