import { useMapPage } from "./hooks/useMapPage";
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
    monitoringFilter,
    hasMonitoringRound,
    mainLocations,
    mainLocationLabel,
    enabledMainLocations,
    locations,
    locationLabel,
    enabledLocations,
    activeProject,
    heatmapEnabled,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions,
    priorityFilters,
    statusFilters,
    hasGps,
    setHeatmapEnabled,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters,
    toggleStatusFilter,
    clearStatusFilters,
    toggleMainLocation,
    toggleLocation,
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
        onOpenSheet={() => setOpen(true)}
        onDownload={handleDownloadArea}
        onCancelDownload={cancelDownload}
        downloading={downloading}
        nearbyOnly={nearbyOnly}
        nearbyRadius={nearbyRadius}
        nearbyRadiusOptions={nearbyRadiusOptions}
        heatmapEnabled={heatmapEnabled}
        priorityFilters={priorityFilters}
        statusFilters={statusFilters}
        monitoringFilter={monitoringFilter}
        hasMonitoringRound={hasMonitoringRound}
        hasGps={hasGps}
        onToggleHeatmap={() => setHeatmapEnabled((value) => !value)}
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
        mainLocations={mainLocations}
        mainLocationLabel={mainLocationLabel}
        enabledMainLocations={enabledMainLocations}
        onToggleMainLocation={toggleMainLocation}
        locations={locations}
        locationLabel={locationLabel}
        enabledLocations={enabledLocations}
        onToggleLocation={toggleLocation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          focusLeak(leak, 17);
          setOpen(false);
        }}
      />
    </div>
  );
}
