import { lazy, Suspense } from "react";
import { useLanguage } from "./hooks/useLanguage";
import { isListPage } from "@/app/pages";
import { useModalDialog } from "@/hooks/useModalDialog";

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
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
          onClick={() =>
            downloadRecoveryData(
              recoveryData,
              `${projectName || "project"}-recovery.json`,
            )
          }
        >
          {t("app.loadError.download")}
        </button>
      )}
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
              cardPage={page === "component"}
              userProfile={userProfile}
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
