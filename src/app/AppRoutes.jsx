import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useLanguage } from "./hooks/useLanguage";
import { isListPage } from "@/app/pages";
import { MODULE } from "@/app/modules/activeModule";
import { STATUS } from "@/utils/status";
import { useModalDialog } from "@/hooks/useModalDialog";
import { saveRecoveryFile } from "@/services/storage/saveRecoveryFile";

const Settings = lazy(() => import("@/pages/Settings/Settings"));
const AddLeak = lazy(() => import("@/pages/AddLeak/AddLeak"));
const MainPage = lazy(() => import("@/pages/MainPage/MainPage"));
const DataBase = lazy(() => import("@/pages/DataBase/DataBase"));
const MapPage = lazy(() => import("@/pages/MapPage/MapPage"));
const Monitoring = lazy(() => import("@/pages/Monitoring/Monitoring"));
const RepairRound = lazy(() => import("@/pages/Repairs/RepairRound"));
const RepairCheck = lazy(() => import("@/pages/Repairs/RepairCheck"));
const AcceptanceList = lazy(() => import("@/pages/Repairs/AcceptanceList"));
const Reconcile = lazy(() => import("@/pages/Reconcile/Reconcile"));
const ExportPage = lazy(() => import("@/pages/Export/ExportPage"));
const CoveragePage = lazy(() => import("@/pages/Coverage/CoveragePage"));
const SchemasPage = lazy(() => import("@/pages/Schemas/SchemasPage"));
const ComponentRegistry = lazy(
  () => import("@/pages/ComponentRegistry/ComponentRegistry"),
);

export function AppLoader({ label = null, overlay = false }) {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t("app.loading");
  const dialogRef = useModalDialog({
    open: overlay,
    closeDisabled: true,
  });

  return (
    <div
      ref={overlay ? dialogRef : undefined}
      className={`appLoader${overlay ? " appLoaderOverlay" : ""}`}
      role={overlay ? "dialog" : "status"}
      aria-modal={overlay || undefined}
      aria-label={overlay ? resolvedLabel : undefined}
      aria-live="polite"
      aria-busy="true"
      tabIndex={overlay ? -1 : undefined}
    >
      <span className="appLoaderRing" aria-hidden="true" />
      <span className="appLoaderText">{resolvedLabel}</span>
    </div>
  );
}

function downloadRecoveryData(data, fileName) {
  return saveRecoveryFile({
    fileName,
    text: JSON.stringify(data, null, 2),
  });
}

function ProjectDataLoadWarning({ onRetry }) {
  const { t } = useLanguage();
  return (
    <section className="dataLoadWarning" role="status" aria-live="polite">
      <span className="dataLoadWarningIcon" aria-hidden="true">
        !
      </span>
      <div className="dataLoadWarningContent">
        <strong>{t("app.loadWarning.title")}</strong>
        <p>{t("app.loadWarning.description")}</p>
      </div>
      <button type="button" onClick={onRetry}>
        {t("app.loadWarning.retry")}
      </button>
    </section>
  );
}

function ProjectDataLoadError({ onRetry, error, data, projectName }) {
  const { t } = useLanguage();
  const recoveryData = error?.recoveryData ?? (data?.length ? data : null);
  // Куда лёг файл, видно на экране: в браузере он уходит в загрузки сам, на
  // телефоне — в папку, которую иначе пришлось бы искать наугад, а отказ до
  // этого не показывался вообще.
  const [saveNotice, setSaveNotice] = useState(
    /** @type {string|null} */ (null),
  );
  return (
    <section className="dataLoadError" role="alert" aria-live="assertive">
      <span className="dataLoadErrorIcon" aria-hidden="true">
        !
      </span>
      <h1>{t("app.loadError.title")}</h1>
      <p>{t("app.loadError.description")}</p>
      <button type="button" onClick={onRetry}>
        {t("app.loadError.retry")}
      </button>
      {recoveryData && (
        <button
          type="button"
          onClick={async () => {
            setSaveNotice(null);
            const result = await downloadRecoveryData(
              recoveryData,
              `${projectName || "project"}-recovery.json`,
            );
            setSaveNotice(
              result.ok
                ? result.path
                  ? t("app.loadError.saved", { path: result.path })
                  : t("app.loadError.downloaded", {
                      fileName: result.fileName,
                    })
                : t("app.loadError.saveFailed"),
            );
          }}
        >
          {t("app.loadError.download")}
        </button>
      )}
      {saveNotice && <p>{saveNotice}</p>}
    </section>
  );
}

export default function AppRoutes({
  activeProject,
  clear,
  coords,
  data,
  dataLoaded,
  goBack,
  gpsEnabled,
  handleCreateExcelCopy,
  handleImportIntoExisting,
  handleImportZip,
  handleSetupImportInventory,
  importingDataLabel,
  isImportingProject,
  loadError,
  loadWarning,
  page,
  prevPage,
  requestMonitoring,
  requestMonitoringQueue,
  requestedMonitoringLeakId,
  requestedMonitoringLeakIds,
  monitoringReturnPage = /** @type {string|null} */ (null),
  notifyApp = /** @type {((type: string, message: string) => void)|null} */ (
    null
  ),
  setMonitoringReturnPage = /** @type {(page: string|null) => void} */ (
    () => {}
  ),
  retryLoad,
  save,
  setGpsEnabled,
  scopedData,
  // Выбор места — для строки области на экране экспорта (8a).
  leakScope = /** @type {any} */ (null),
  onLocationScopeOpen = /** @type {(() => void)|undefined} */ (undefined),
  setPage,
  settingsSection = /** @type {string|null} */ (null),
  coverage = /** @type {any} */ (null),
  module = /** @type {string|undefined} */ (undefined),
  routeProgress = /** @type {any} */ (null),
  componentAddRequest = 0,
  onEndRoute = /** @type {(() => void)|undefined} */ (undefined),
  setRequestedMonitoringLeakId,
  setRequestedMonitoringLeakIds,
  sharedFilters,
  mapBase,
  onMapBaseChange,
  userProfile,
}) {
  const listPage = isListPage(page);
  const { t } = useLanguage();
  // В модуле ремонтов свайп по карточке и «Проверить» у выбранных ведут не в
  // мониторинг, а в проверку ремонта (7c) — поверх той же страницы. Свайп
  // открывает и принятый ремонт: его перепроверяют (см. applyRepairCheck).
  // Выбранные — только открытые, по очереди; крестик очередь прерывает.
  const [repairQueue, setRepairQueue] = useState(
    /** @type {{ ids: any[], total: number }} */ ({ ids: [], total: 0 }),
  );
  const repairMode = module === MODULE.REPAIRS;
  const startRepairQueue = (leaks) => {
    const open = leaks.filter(
      (leak) => (leak?.status ?? STATUS.OPEN) !== STATUS.RESOLVED,
    );
    if (!open.length) {
      notifyApp?.("warning", t("repairs.accept.alreadyAccepted"));
      return;
    }
    setRepairQueue({
      ids: open.map((leak) => leak.id),
      total: open.length,
    });
  };
  const checkLeak = repairMode
    ? (leak) => setRepairQueue({ ids: [leak.id], total: 1 })
    : requestMonitoring;
  const checkLeaks = repairMode ? startRepairQueue : requestMonitoringQueue;
  const repairCheckLeak =
    repairQueue.ids.length > 0
      ? (data.find((leak) => leak.id === repairQueue.ids[0]) ?? null)
      : null;
  const checkLabel = repairMode ? t("repairs.checkSwipe") : null;
  // «Сверить» у булавки компонента на карте — как «Проверить» в
  // мониторинге: осмотр на экране сверки, затем назад.
  const [reconcileRequest, setReconcileRequest] = useState(
    /** @type {{ id: any }|null} */ (null),
  );
  const reconcileReturnRef = useRef(/** @type {string|null} */ (null));
  const consumeReconcileRequest = useCallback(
    () => setReconcileRequest(null),
    [],
  );
  const requestReconcile = (component) => {
    if (component?.id == null) return;
    reconcileReturnRef.current = page;
    setReconcileRequest({ id: component.id });
    setPage("reconcile");
  };

  return (
    <div
      className={`pages ${page === "map" ? "pagesMap" : ""} ${
        listPage ? "pagesList" : ""
      }`}
    >
      <Suspense fallback={<AppLoader />}>
        {!dataLoaded && <AppLoader />}

        {isImportingProject && <AppLoader overlay label={importingDataLabel} />}

        {dataLoaded && !isImportingProject && loadError && (
          <ProjectDataLoadError
            onRetry={retryLoad}
            error={loadError}
            data={data}
            projectName={activeProject?.name}
          />
        )}
        {dataLoaded && !isImportingProject && !loadError && loadWarning && (
          <ProjectDataLoadWarning onRetry={retryLoad} />
        )}
        {dataLoaded && !isImportingProject && !loadError && page === "" && (
          <MainPage
            setPage={setPage}
            data={data}
            scopedData={scopedData}
            setData={save}
            onMonitorLeak={checkLeak}
            userProfile={userProfile}
            coverage={coverage}
            module={module}
          />
        )}

        {dataLoaded && !loadError && page === "add" && (
          <AddLeak
            data={data}
            setData={save}
            coords={coords}
            gpsEnabled={gpsEnabled}
            setGpsEnabled={setGpsEnabled}
            setPage={setPage}
            onBack={() => goBack(prevPage)}
            userProfile={userProfile}
            projectId={activeProject?.id}
          />
        )}

        {dataLoaded &&
          !loadError &&
          (page === "settings" || page === "import") && (
            <Settings
              view={page === "import" ? "import" : "settings"}
              setPage={setPage}
              focusSection={settingsSection}
              onBack={() => goBack(prevPage)}
              data={data}
              setData={save}
              clearDatabase={clear}
              onImportZip={handleImportZip}
              onImportIntoExisting={handleImportIntoExisting}
              onCreateExcelCopy={handleCreateExcelCopy}
              onImportInventory={handleSetupImportInventory}
            />
          )}

        {dataLoaded && !isImportingProject && !loadError && page === "db" && (
          <DataBase
            data={data}
            setData={save}
            coords={coords}
            sharedFilters={sharedFilters}
            onMonitorLeak={checkLeak}
            onMonitorLeaks={checkLeaks}
            monitorLabel={checkLabel}
            repairMode={repairMode}
            userProfile={userProfile}
          />
        )}

        {dataLoaded && !loadError && page === "coverage" && (
          <CoveragePage data={data} onBack={() => goBack(prevPage)} />
        )}

        {dataLoaded && !loadError && page === "export" && (
          <ExportPage
            data={data}
            scopedData={scopedData}
            locationScope={leakScope}
            onLocationScopeOpen={onLocationScopeOpen}
            onBack={() => goBack(prevPage)}
          />
        )}

        {dataLoaded && !loadError && page === "reconcile" && (
          <Reconcile
            project={activeProject}
            sharedFilters={sharedFilters}
            userProfile={userProfile}
            requestedComponentId={reconcileRequest?.id ?? null}
            onRequestedComponentConsumed={consumeReconcileRequest}
            // Как у проверки мониторинга: назад туда, откуда позвали, а итог
            // сохранения — уведомлением там.
            onLeaveCheck={(event) => {
              const back = reconcileReturnRef.current;
              reconcileReturnRef.current = null;
              if (back == null) return false;
              setPage(back);
              if (event?.saved) notifyApp?.("success", event.saved);
              if (event?.warning) notifyApp?.("warning", event.warning);
              return true;
            }}
          />
        )}

        {dataLoaded && !loadError && page === "acceptance" && (
          <AcceptanceList
            onBack={() => goBack(prevPage)}
            userProfile={userProfile}
          />
        )}

        {dataLoaded &&
          !isImportingProject &&
          !loadError &&
          page === "repair-round" && (
            <RepairRound
              data={data}
              scopedData={scopedData}
              setData={save}
              coords={coords}
              sharedFilters={sharedFilters}
              userProfile={userProfile}
            />
          )}

        {dataLoaded &&
          !isImportingProject &&
          !loadError &&
          page === "monitoring" && (
            <Monitoring
              data={data}
              setData={save}
              coords={coords}
              sharedFilters={sharedFilters}
              requestedLeakId={requestedMonitoringLeakId}
              requestedLeakIds={requestedMonitoringLeakIds}
              onRequestedLeakConsumed={() => setRequestedMonitoringLeakId(null)}
              onRequestedLeaksConsumed={() => setRequestedMonitoringLeakIds([])}
              // Проверка, позванная с другого экрана, — по крестику и после
              // сохранения назад туда; итог сохранения — уведомлением там.
              onLeaveCheck={(event) => {
                const back = monitoringReturnPage;
                setMonitoringReturnPage(null);
                if (back == null) return false;
                setPage(back);
                if (event?.saved) notifyApp?.("success", event.saved);
                return true;
              }}
              userProfile={userProfile}
            />
          )}

        {dataLoaded &&
          !isImportingProject &&
          !loadError &&
          (page === "components" || page === "component") && (
            /*
             * Rendered for both pages so the same instance survives the switch:
             * the card takes over the screen under its own page value, and the
             * registry holds which card is open. Unmounting on the way in would
             * lose it.
             */
            <ComponentRegistry
              project={activeProject}
              coords={coords}
              gpsEnabled={gpsEnabled}
              setGpsEnabled={setGpsEnabled}
              cardPage={page === "component"}
              userProfile={userProfile}
              // Тот же выбор места, что у базы, карты и мониторинга: экран его
              // уже читает, но до сих пор не получал — фильтр шапки на реестре
              // молча ничего не отбирал.
              sharedFilters={sharedFilters}
              onOpenCard={() => setPage("component")}
              addRequest={componentAddRequest}
              onCloseCard={() => setPage("components")}
            />
          )}

        {dataLoaded &&
          !isImportingProject &&
          !loadError &&
          page === "schemas" && <SchemasPage project={activeProject} />}

        {dataLoaded && !isImportingProject && !loadError && page === "map" && (
          <MapPage
            leaks={data}
            coords={coords}
            gpsEnabled={gpsEnabled}
            sharedFilters={sharedFilters}
            base={mapBase}
            onBaseChange={onMapBaseChange}
            routeProgress={routeProgress}
            onRouteEnd={onEndRoute}
            module={module}
            setData={save}
            userProfile={userProfile}
            onMonitor={checkLeak}
            onReconcile={requestReconcile}
            repairMode={module === "repairs"}
          />
        )}
        {repairCheckLeak && (
          <RepairCheck
            // Новый ключ — чистая форма для следующей утечки очереди.
            key={repairCheckLeak.id}
            leak={repairCheckLeak}
            data={data}
            setData={save}
            userProfile={userProfile}
            progress={
              repairQueue.total > 1
                ? {
                    index: repairQueue.total - repairQueue.ids.length + 1,
                    total: repairQueue.total,
                  }
                : null
            }
            onSaved={() =>
              setRepairQueue((queue) => ({
                ...queue,
                ids: queue.ids.slice(1),
              }))
            }
            onClose={() => setRepairQueue({ ids: [], total: 0 })}
            onNotify={({ type, message }) => notifyApp?.(type, message)}
          />
        )}
      </Suspense>
    </div>
  );
}
