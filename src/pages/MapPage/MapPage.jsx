import { useMapPage } from "./hooks/useMapPage";
import MapControls from "./components/MapControls";
import TileProgress from "./components/TileProgress";
import MobileSheet from "@/components/ui/MobileSheet/MobileSheet";
import Notification from "@/components/ui/Notification/Notification";
import s from "./MapPage.module.scss";

export default function MapPage({ leaks, coords }) {
  const {
    containerRef,
    open, setOpen,
    notification, setNotification,
    tileProgress,
    downloading,
    visibleLeaks,
    locations,
    locationLabel,
    enabledLocations,
    activeProject,
    toggleLocation,
    handleDownloadArea,
    handleExportKML,
    focusLeak,
    locateMe,
  } = useMapPage({ leaks, coords });

  return (
    <div className={s.mapWrapper}>
      <Notification notification={notification} onClose={() => setNotification(null)} />

      <div ref={containerRef} className={s.mapCanvas} />

      <MapControls
        onLocate={locateMe}
        onOpenSheet={() => setOpen(true)}
        onDownload={handleDownloadArea}
        downloading={downloading}
      />

      {activeProject && visibleLeaks.length > 0 && (
        <div className={s.exportGroup}>
          <button type="button" className={s.exportBtn} onClick={handleExportKML}>
            ↗ KML
          </button>
        </div>
      )}

      <TileProgress progress={tileProgress} />

      <MobileSheet
        open={open}
        leaks={visibleLeaks}
        locations={locations}
        locationLabel={locationLabel}
        enabledLocations={enabledLocations}
        onToggleLocation={toggleLocation}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          focusLeak(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}
