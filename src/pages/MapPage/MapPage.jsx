import { MAP_BASE, useMapPage } from "./hooks/useMapPage";
import { useRenderMetric } from "@/utils/renderMetrics";
import MapControls from "./components/MapControls";
import TileProgress from "./components/TileProgress";
import MobileSheet from "@/components/ui/MobileSheet/MobileSheet";
import Notification from "@/components/ui/Notification/Notification";
import s from "./MapPage.module.scss";

export default function MapPage({
  leaks,
  coords,
  gpsEnabled = true,
  sharedFilters,
}) {
  useRenderMetric("MapPage");

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
    monitoringFilter,
    hasMonitoringRound,
    activeProject,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions,
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
  } = useMapPage({ leaks, coords, gpsEnabled, sharedFilters });

  return (
    <div className={s.mapWrapper}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div ref={containerRef} className={s.mapCanvas} />

      <MapControls
        onLocate={locateMe}
        gpsEnabled={gpsEnabled}
        showsComponents={showsComponents}
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
