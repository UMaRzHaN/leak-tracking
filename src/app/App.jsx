import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "@fontsource-variable/manrope";
import "@/index.scss";
import { useLocationScope } from "@/hooks/useLocationScope";
import { useRegistryLocationSource } from "@/hooks/useRegistryLocationSource";
import { MAP_BASE } from "@/pages/MapPage/mapBase";
import { showsComponentTree } from "./pages";
import { STATUS } from "@/utils/status";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { computeSurveyCoverage } from "@/utils/surveyCoverage";
import {
  MODULE,
  moduleHomePage,
  useActiveModule,
} from "@/app/modules/activeModule";
import { countRepairStages } from "@/domain/repairStages";
import {
  readRoute,
  routeProgress,
  saveRoute,
} from "@/features/route/routePlan";

const Header = lazy(() => import("@/components/layout/Header/Header"));
const Footer = lazy(() => import("@/components/layout/Footer/Footer"));
const AppMenu = lazy(() => import("@/components/layout/AppMenu/AppMenu"));
const RouteSheet = lazy(() => import("@/features/route/RouteSheet"));
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [module, setModule] = useActiveModule();
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  // Маршрут живёт в проекте: после перезапуска обход продолжается с той же
  // точки, а в другом проекте своего маршрута нет.
  const [storedRoute, setStoredRoute] = useState(() =>
    readRoute(activeProject?.id),
  );
  useEffect(() => {
    setStoredRoute(readRoute(activeProject?.id));
  }, [activeProject?.id]);
  const setRoute = (next) => {
    saveRoute(activeProject?.id, next);
    setStoredRoute(next);
  };
  const selectModule = (next) => {
    setModule(next);
    setPage(moduleHomePage(next));
  };
  // «+» инвентаризации: реестр открывает пустую карточку, когда номер
  // запроса меняется. Номер, а не флаг — второй запрос подряд тоже должен
  // сработать.
  const [componentAddRequest, setComponentAddRequest] = useState(0);
  // У инвентаризации своей главной нет: её «Записи» — это реестр.
  useEffect(() => {
    if (module === MODULE.INVENTORY && page === "") {
      setPage("components", { replace: true });
    }
  }, [module, page, setPage]);
  // Раздел настроек, к которому прокрутить: меню ведёт в импорт и
  // синхронизацию, а они пока живут внутри настроек, а не на своих экранах.
  const [settingsSection, setSettingsSection] = useState(
    /** @type {string|null} */ (null),
  );
  useEffect(() => {
    if (page !== "settings") setSettingsSection(null);
  }, [page]);
  const openSettings = (section) => {
    setSettingsSection(section);
    setPage("settings");
  };
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
  const registryPage =
    page === "components" || page === "component" || page === "reconcile";
  const [mapBase, setMapBase] = useState(MAP_BASE.LEAKS);
  /*
   * Уходя с карты, база возвращается к утечкам — так было, пока она жила
   * внутри карты и умирала вместе с ней. Подняв её в приложение, я это
   * поведение молча поменял: карта стала открываться там, где её оставили, и
   * съёмка руководства сняла «карту утечек» с железом на ней.
   */
  useEffect(() => {
    if (page !== "map") setMapBase(MAP_BASE.LEAKS);
    // Карта инвентаризации (6c) — это карта железа.
    else if (module === MODULE.INVENTORY) setMapBase(MAP_BASE.COMPONENTS);
  }, [page, module]);
  const componentTree = showsComponentTree(page, mapBase);
  const showRegistry = hasComponentRegistry(activeProject);
  // Главная тоже читает реестр: по нему считается, сколько объектов всего,
  // для строки охвата. Дерево мест шапки от этого не меняется — оно по
  // компонентам только там, где на экране железо.
  const coverageNeedsRegistry =
    page === "" && module === MODULE.LDAR && showRegistry;
  const registryComponents = useRegistryLocationSource(
    componentTree || coverageNeedsRegistry,
  );
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

  const coverage = useMemo(
    () =>
      page === "" && module === MODULE.LDAR
        ? computeSurveyCoverage({
            leaks: leakScope.scopedLeaks,
            components: componentScope.scopedLeaks,
            levelKeys: leakScope.levelKeys,
          })
        : null,
    [
      page,
      module,
      leakScope.scopedLeaks,
      leakScope.levelKeys,
      componentScope.scopedLeaks,
    ],
  );

  // Счётчик пункта «Ремонтные работы» в меню: работы в производстве, без
  // принятых.
  const repairCount = useMemo(() => {
    const counts = countRepairStages(leakScope.scopedLeaks);
    return counts.all - counts.accepted;
  }, [leakScope.scopedLeaks]);

  const progress = useMemo(
    () => routeProgress(storedRoute, data),
    [storedRoute, data],
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
            onMenuOpen={() => setMenuOpen(true)}
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
        settingsSection={settingsSection}
        coverage={coverage}
        module={module}
        routeProgress={module === MODULE.MONITORING ? progress : null}
        componentAddRequest={componentAddRequest}
        onEndRoute={() => setRoute(null)}
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
            module={module}
            onRoute={() => setRouteSheetOpen(true)}
            onAddComponent={
              showRegistry
                ? () => {
                    setComponentAddRequest((value) => value + 1);
                    setPage("components");
                  }
                : null
            }
          />
        </Suspense>
      )}

      {routeSheetOpen && (
        <Suspense fallback={null}>
          <RouteSheet
            open={routeSheetOpen}
            leaks={leakScope.scopedLeaks}
            coords={coords}
            gpsEnabled={gpsEnabled}
            onClose={() => setRouteSheetOpen(false)}
            onShowMap={() => {
              setRouteSheetOpen(false);
              setPage("map");
            }}
            onStart={(ids) => {
              setRoute({ ids, startedAt: new Date().toISOString() });
              setRouteSheetOpen(false);
              setPage("map");
            }}
          />
        </Suspense>
      )}

      {menuOpen && (
        <Suspense fallback={null}>
          <AppMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            setPage={setPage}
            module={module}
            onSelectModule={selectModule}
            onOpenSettings={openSettings}
            onEditProfile={() => setUserProfileOpen(true)}
            userProfile={userProfile}
            projectName={activeProject?.name}
            openCount={scopedOpenCount}
            repairCount={repairCount}
            showRegistry={showRegistry}
          />
        </Suspense>
      )}

      {locationBrowserOpen && (
        <Suspense fallback={null}>
          <LocationBrowser
            open={locationBrowserOpen}
            scope={locationScope}
            onClose={() => setLocationBrowserOpen(false)}
            onApplied={(path, picked = []) => {
              // "Show all" is a way back out of a folder, not a request to go
              // read the whole project, so it leaves the current screen alone.
              // Реестр — тоже список, и выбранную папку он показывает сам;
              // уводить с него на базу значило бы подменить сущность.
              if ((path.length > 0 || picked.length > 0) && !registryPage)
                setPage("db");
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
