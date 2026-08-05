import { lazy, Suspense, useState } from "react";
import "@/index.scss";
import { useLocationScope } from "@/hooks/useLocationScope";

const Header = lazy(() => import("@/components/layout/Header/Header"));
const Footer = lazy(() => import("@/components/layout/Footer/Footer"));
// Only reached from the header button, so it stays out of the initial graph.
const LocationBrowser = lazy(
  () => import("@/features/locationScope/LocationBrowser"),
);
const ProjectSetupScreen = lazy(
  () => import("@/pages/ProjectSetup/ProjectSetupScreen"),
);
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import AppRoutes, { AppLoader } from "./AppRoutes";
import AppDialogs from "./components/AppDialogs";

export default function App() {
  const {
    activeProject,
    clear,
    configure,
    coords,
    data,
    dataLoaded,
    geoError,
    geoLoading,
    goBack,
    gpsEnabled,
    handleCreateExcelCopy,
    handleImportIntoExisting,
    handleImportZip,
    handleSetupImportExcel,
    handleSetupImportZip,
    importingDataLabel,
    isConfigured,
    isImportingProject,
    loadError,
    loadWarning,
    openCount,
    page,
    prevPage,
    requestMonitoring,
    requestMonitoringQueue,
    requestedMonitoringLeakId,
    requestedMonitoringLeakIds,
    retryLoad,
    save,
    setGpsEnabled,
    setPage,
    setRequestedMonitoringLeakId,
    setRequestedMonitoringLeakIds,
    setUserProfile,
    setUserProfileOpen,
    sharedFilters,
    userProfile,
    userProfileOpen,
  } = useAppBootstrap();

  const [locationBrowserOpen, setLocationBrowserOpen] = useState(false);
  const locationScope = useLocationScope({
    leaks: data,
    sharedFilters,
    projectType: activeProject?.type,
  });

  if (!isConfigured) {
    return (
      <Suspense fallback={<AppLoader />}>
        <ProjectSetupScreen
          onComplete={configure}
          onImportZip={handleSetupImportZip}
          onImportExcel={handleSetupImportExcel}
        />
      </Suspense>
    );
  }

  const hideLayout = page === "add" || page === "settings";
  const isListPage = page === "db" || page === "monitoring";

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={`app ${isListPage ? "appList" : ""}`}>
      {!hideLayout && (
        <Suspense fallback={null}>
          <Header
            geoLoading={geoLoading}
            coords={coords}
            geoError={geoError}
            setPage={setPage}
            gpsEnabled={gpsEnabled}
            setGpsEnabled={setGpsEnabled}
            userProfile={userProfile}
            onUserProfileOpen={() => setUserProfileOpen(true)}
            locationScope={locationScope}
            onLocationScopeOpen={() => setLocationBrowserOpen(true)}
          />
        </Suspense>
      )}

      <AppRoutes
        activeProject={activeProject}
        clear={clear}
        coords={coords}
        data={data}
        dataLoaded={dataLoaded}
        goBack={goBack}
        gpsEnabled={gpsEnabled}
        handleCreateExcelCopy={handleCreateExcelCopy}
        handleImportIntoExisting={handleImportIntoExisting}
        handleImportZip={handleImportZip}
        importingDataLabel={importingDataLabel}
        isImportingProject={isImportingProject}
        loadError={loadError}
        loadWarning={loadWarning}
        page={page}
        prevPage={prevPage}
        requestMonitoring={requestMonitoring}
        requestMonitoringQueue={requestMonitoringQueue}
        requestedMonitoringLeakId={requestedMonitoringLeakId}
        requestedMonitoringLeakIds={requestedMonitoringLeakIds}
        retryLoad={retryLoad}
        save={save}
        setPage={setPage}
        setRequestedMonitoringLeakId={setRequestedMonitoringLeakId}
        setRequestedMonitoringLeakIds={setRequestedMonitoringLeakIds}
        sharedFilters={sharedFilters}
        userProfile={userProfile}
      />

      {!hideLayout && (
        <Suspense fallback={null}>
          <Footer page={page} setPage={setPage} openCount={openCount} />
        </Suspense>
      )}

      {locationBrowserOpen && (
        <Suspense fallback={null}>
          <LocationBrowser
            open={locationBrowserOpen}
            scope={locationScope}
            onClose={() => setLocationBrowserOpen(false)}
            onApplied={(path) => {
              // "Show all" is a way back out of a folder, not a request to go
              // read the whole project, so it leaves the current screen alone.
              if (path.length > 0) setPage("db");
            }}
          />
        </Suspense>
      )}

      <AppDialogs
        open={userProfileOpen}
        profile={userProfile}
        onSaveProfile={setUserProfile}
        onCloseProfile={() => setUserProfileOpen(false)}
      />
    </div>
  );
}
