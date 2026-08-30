import { lazy, Suspense, useState } from "react";
import { useLanguage } from "./hooks/useLanguage";
import { isListPage } from "@/app/pages";
import { useModalDialog } from "@/hooks/useModalDialog";
import { saveRecoveryFile } from "@/services/storage/saveRecoveryFile";

const Settings = lazy(() => import("@/pages/Settings/Settings"));
const AddLeak = lazy(() => import("@/pages/AddLeak/AddLeak"));
const MainPage = lazy(() => import("@/pages/MainPage/MainPage"));
const DataBase = lazy(() => import("@/pages/DataBase/DataBase"));
const MapPage = lazy(() => import("@/pages/MapPage/MapPage"));
const Monitoring = lazy(() => import("@/pages/Monitoring/Monitoring"));
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
  retryLoad,
  save,
  setGpsEnabled,
  scopedData,
  setPage,
  setRequestedMonitoringLeakId,
  setRequestedMonitoringLeakIds,
  sharedFilters,
  userProfile,
}) {
  const listPage = isListPage(page);

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
            onMonitorLeak={requestMonitoring}
            userProfile={userProfile}
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

        {dataLoaded && !loadError && page === "settings" && (
          <Settings
            setPage={setPage}
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
            onMonitorLeak={requestMonitoring}
            onMonitorLeaks={requestMonitoringQueue}
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
              onCloseCard={() => setPage("components")}
            />
          )}

        {dataLoaded && !isImportingProject && !loadError && page === "map" && (
          <MapPage
            leaks={data}
            coords={coords}
            gpsEnabled={gpsEnabled}
            sharedFilters={sharedFilters}
          />
        )}
      </Suspense>
    </div>
  );
}
