import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "@/index.scss";
import { useLocationScope } from "@/hooks/useLocationScope";
import { useRegistryLocationSource } from "@/hooks/useRegistryLocationSource";
import { MAP_BASE } from "@/pages/MapPage/mapBase";
import { showsComponentTree } from "./pages";
import { STATUS } from "@/utils/status";

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
import { useTheme } from "./hooks/useTheme";
import AppRoutes, { AppLoader } from "./AppRoutes";
import AppDialogs from "./components/AppDialogs";
import { isFullScreenPage, isListPage } from "@/app/pages";

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
    handleSetupImportInventory,
    handleSetupImportZip,
    importingDataLabel,
    isConfigured,
    isImportingProject,
    loadError,
    loadWarning,
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

  // Значение здесь не нужно — нужна сама подписка. Пока её держал только
  // экран настроек, за системной темой никто не следил, пока настройки
  // закрыты, и телефон, переключившийся на ночную, оставался со светлым
  // приложением до следующего запуска.
  useTheme();

  const [locationBrowserOpen, setLocationBrowserOpen] = useState(false);
  const leakScope = useLocationScope({
    leaks: data,
    sharedFilters,
    projectType: activeProject?.type,
  });

  /*
   * Один выбор места на всё приложение, но считает он то, что на экране. На
   * реестре рядом с «Мессояхское УПГ» стояло число утечек, а открывалась папка
   * с железом: фильтр общий, а деревья у сущностей разные.
   */
  const registryPage = page === "components" || page === "component";
  const [mapBase, setMapBase] = useState(MAP_BASE.LEAKS);
  /*
   * Уходя с карты, база возвращается к утечкам — так было, пока она жила
   * внутри карты и умирала вместе с ней. Подняв её в приложение, я это
   * поведение молча поменял: карта стала открываться там, где её оставили, и
   * съёмка руководства сняла «карту утечек» с железом на ней.
   */
  useEffect(() => {
    if (page !== "map") setMapBase(MAP_BASE.LEAKS);
  }, [page]);
  const componentTree = showsComponentTree(page, mapBase);
  const registryComponents = useRegistryLocationSource(componentTree);
  const componentScope = useLocationScope({
    leaks: registryComponents,
    sharedFilters,
    projectType: activeProject?.type,
  });
  const locationScope = componentTree ? componentScope : leakScope;

  const scopedOpenCount = useMemo(
    () =>
      leakScope.scopedLeaks.filter(
        (leak) => (leak.status ?? STATUS.OPEN) === STATUS.OPEN,
      ).length,
    [leakScope.scopedLeaks],
  );

  if (!isConfigured) {
    return (
      <Suspense fallback={<AppLoader />}>
        <ProjectSetupScreen
          onComplete={configure}
          onImportZip={handleSetupImportZip}
          onImportExcel={handleSetupImportExcel}
          onImportInventory={handleSetupImportInventory}
        />
      </Suspense>
    );
  }

  const hideLayout = isFullScreenPage(page);
  const listPage = isListPage(page);

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={`app ${listPage ? "appList" : ""}`}>
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
        setGpsEnabled={setGpsEnabled}
        handleCreateExcelCopy={handleCreateExcelCopy}
        handleImportIntoExisting={handleImportIntoExisting}
        handleImportZip={handleImportZip}
        handleSetupImportInventory={handleSetupImportInventory}
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
        scopedData={leakScope.scopedLeaks}
        setPage={setPage}
        setRequestedMonitoringLeakId={setRequestedMonitoringLeakId}
        setRequestedMonitoringLeakIds={setRequestedMonitoringLeakIds}
        mapBase={mapBase}
        onMapBaseChange={setMapBase}
        sharedFilters={sharedFilters}
        userProfile={userProfile}
      />

      {!hideLayout && (
        <Suspense fallback={null}>
          {/* The badge counts what the "База" button leads to, and that screen
              is scoped, so counting the whole project would contradict the
              list the user lands on. */}
          <Footer
            page={page}
            setPage={setPage}
            openCount={scopedOpenCount}
            project={activeProject}
          />
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
              // Реестр — тоже список, и выбранную папку он показывает сам;
              // уводить с него на базу значило бы подменить сущность.
              if (path.length > 0 && !registryPage) setPage("db");
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
