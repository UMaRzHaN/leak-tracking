import { useMapPage } from "./hooks/useMapPage";
import { mapFiltersFor } from "./mapModuleFilters";
import { useRenderMetric } from "@/utils/renderMetrics";
import MapControls from "./components/MapControls";
import MapPinCard from "./components/MapPinCard";
import MapExportButton from "./components/MapExportButton";
import TileProgress from "./components/TileProgress";
import MobileSheet from "@/components/ui/MobileSheet/MobileSheet";
import Notification from "@/components/ui/Notification/Notification";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import RouteBanner from "@/features/route/RouteBanner";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useRepairStages } from "./hooks/useRepairStages";
import {
  MAP_FOCUS_ZOOM,
  SHOW_ON_MAP_EVENT,
  takeMapFocus,
} from "@/app/mapFocus";
import { globalScope } from "@/utils/globalScope";
import { useLeakActions } from "@/pages/DataBase/hooks/useLeakActions";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useCanCheckRepair } from "@/pages/Repairs/useCanCheckRepair";
import { MODULE } from "@/app/modules/activeModule";
import s from "./MapPage.module.scss";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);
const MapComponentDetails = lazy(
  () => import("./components/MapComponentDetails"),
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
  onRouteEnd = /** @type {(() => void)|undefined} */ (undefined),
  // Карта модуля ремонтов (7i): только ремонты и чипы по стадии работ.
  repairMode = false,
  // Модуль приложения: базу и отборы карты выбирает он, а не переключатель.
  module = /** @type {string|undefined} */ (undefined),
  // Карточка булавки (5d): «Открыть запись» правит её здесь же, «Проверить»
  // ведёт в обход. Без них карточка только показывает точку.
  setData = /** @type {((next: any) => any)|null} */ (null),
  userProfile = /** @type {any} */ (null),
  onMonitor = /** @type {((leak: any) => void)|null} */ (null),
  // «Сверить» у булавки компонента: ведёт на экран сверки (решает приложение).
  onReconcile = /** @type {((component: any) => void)|null} */ (null),
}) {
  useRenderMetric("MapPage");
  const { t } = useLanguage();
  // Компонент, открытый из карточки булавки целиком.
  const [openComponentId, setOpenComponentId] = useState(
    /** @type {any} */ (null),
  );
  const closeComponent = useCallback(() => setOpenComponentId(null), []);
  const { stage, setStage, stageCounts, shownLeaks } = useRepairStages(
    leaks,
    repairMode,
  );

  const {
    containerRef,
    open,
    setOpen,
    notification,
    setNotification,
    tileProgress,
    downloading,
    searchedLeaks,
    tagQuery,
    setTagQuery,
    pickTag,
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
    exportCount,
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
  const canCheckRepair = useCanCheckRepair(module === MODULE.REPAIRS);
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

      <MapControls
        topContent={
          routeProgress && !showsComponents ? (
            <RouteBanner
              progress={routeProgress}
              coords={coords}
              gpsEnabled={gpsEnabled}
              onFocus={(leak) => {
                focusLeak(leak, 17);
                selectLeak(leak);
              }}
              onEnd={() => onRouteEnd?.()}
            />
          ) : null
        }
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
        searchActive={tagQuery.trim() !== ""}
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

      {activeProject && exportCount > 0 && (
        <MapExportButton count={exportCount} onExport={handleExportKML} />
      )}

      {selectedLeak && !open && (
        <MapPinCard
          pin={selectedLeak}
          coords={gpsEnabled ? coords : null}
          module={module}
          userProfile={userProfile}
          onMonitor={onMonitor}
          canCheckRepair={canCheckRepair}
          onReconcile={onReconcile}
          onOpenLeak={(leak) => {
            selectLeak(null);
            leakActions.setActiveLeak(leak);
          }}
          onOpenComponent={(component) => {
            selectLeak(null);
            setOpenComponentId(component.id);
          }}
        />
      )}

      <Suspense fallback={null}>
        {openComponentId != null && (
          <MapComponentDetails
            project={activeProject}
            componentId={openComponentId}
            userProfile={userProfile}
            onClose={closeComponent}
          />
        )}
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
        leaks={searchedLeaks}
        query={tagQuery}
        onQueryChange={setTagQuery}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          pickTag(leak);
          focusLeak(leak, MAP_FOCUS_ZOOM);
          setOpen(false);
        }}
      />
    </div>
  );
}
