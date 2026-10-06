import { useMapPage } from "./hooks/useMapPage";
import { mapFiltersFor } from "./mapModuleFilters";
import { useRenderMetric } from "@/utils/renderMetrics";
import MapControls from "./components/MapControls";
import TileProgress from "./components/TileProgress";
import MobileSheet from "@/components/ui/MobileSheet/MobileSheet";
import Notification from "@/components/ui/Notification/Notification";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import RouteBanner from "@/features/route/RouteBanner";
import { componentStatusColor } from "@/domain/componentStatuses";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  countRepairStages,
  getRepairLeaks,
  getRepairStage,
} from "@/domain/repairStages";
import MapLeakCard from "./components/MapLeakCard";
import {
  MAP_FOCUS_ZOOM,
  SHOW_ON_MAP_EVENT,
  takeMapFocus,
} from "@/app/mapFocus";
import { globalScope } from "@/utils/globalScope";
import { useLeakActions } from "@/pages/DataBase/hooks/useLeakActions";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { MODULE } from "@/app/modules/activeModule";
import s from "./MapPage.module.scss";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);

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
  // Модуль приложения: базу и отборы карты выбирает он, а не переключатель.
  module = /** @type {string|undefined} */ (undefined),
  // Карточка булавки (5d): «Открыть запись» правит её здесь же, «Проверить»
  // ведёт в обход. Без них карточка только показывает точку.
  setData = /** @type {((next: any) => any)|null} */ (null),
  userProfile = /** @type {any} */ (null),
  onMonitor = /** @type {((leak: any) => void)|null} */ (null),
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
    tagFilter,
    setTagFilter,
    tagCounts,
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
    selectedLeak,
    selectLeak,
  } = useMapPage({
    leaks: shownLeaks,
    coords,
    gpsEnabled,
    sharedFilters,
    base: controlledBase,
    onBaseChange,
    module,
  });

  const { deletePhoto } = usePhotoStorage();
  const notify = useCallback(
    (type, message, options = {}) =>
      setNotification({ type, message, ...options }),
    [setNotification],
  );
  const leakActions = useLeakActions({
    data: leaks,
    setData: setData ?? (() => {}),
    notify,
    deletePhoto,
    userProfile,
  });

  // «Показать на карте» из карточки, открытой на самой карте: переходить
  // некуда, поэтому карточка закрывается, а карта встаёт на точку.
  const { setActiveLeak } = leakActions;
  useEffect(() => {
    const show = () => {
      const point = takeMapFocus();
      if (!point) return;
      setActiveLeak(null);
      selectLeak(null);
      focusLeak(point, MAP_FOCUS_ZOOM);
    };
    globalScope.addEventListener?.(SHOW_ON_MAP_EVENT, show);
    return () => globalScope.removeEventListener?.(SHOW_ON_MAP_EVENT, show);
  }, [focusLeak, selectLeak, setActiveLeak]);

  return (
    <div className={s.mapWrapper}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div ref={containerRef} className={s.mapCanvas} />

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
        moduleLabel={
          repairMode
            ? t("map.modules.repairs")
            : module === "monitoring"
              ? t("map.modules.monitoring")
              : showsComponents
                ? t("map.modules.inventory")
                : t("map.modules.leaks")
        }
        onLocate={locateMe}
        gpsEnabled={gpsEnabled}
        showsComponents={showsComponents}
        componentStatus={componentStatus}
        filters={mapFiltersFor(module)}
        tagFilter={tagFilter}
        onTagChange={setTagFilter}
        tagCounts={tagCounts}
        stage={stage}
        stageCounts={stageCounts}
        onStageChange={setStage}
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

      {selectedLeak && !open && (
        <MapLeakCard
          leak={selectedLeak}
          coords={gpsEnabled ? coords : null}
          onMonitor={module === MODULE.MONITORING ? onMonitor : null}
          onOpen={(leak) => {
            selectLeak(null);
            leakActions.setActiveLeak(leak);
          }}
        />
      )}

      <Suspense fallback={null}>
        {leakActions.activeLeak && setData && (
          <LeakDetailsSheet
            leak={leakActions.activeLeak}
            allLeaks={leaks}
            onClose={() => leakActions.setActiveLeak(null)}
            onSave={leakActions.handleSave}
            onDelete={leakActions.handleDelete}
            userProfile={userProfile}
          />
        )}
      </Suspense>

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
