import { lazy, Suspense } from "react";
import { useLanguage } from "./hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";

const Settings = lazy(() => import("@/pages/Settings/Settings"));
const AddLeak = lazy(() => import("@/pages/AddLeak/AddLeak"));
const MainPage = lazy(() => import("@/pages/MainPage/MainPage"));
const DataBase = lazy(() => import("@/pages/DataBase/DataBase"));
const MapPage = lazy(() => import("@/pages/MapPage/MapPage"));
const Monitoring = lazy(() => import("@/pages/Monitoring/Monitoring"));

export function AppLoader({ label = null, overlay = false }) {
  const { lang } = useLanguage();
  const resolvedLabel =
    label ?? (lang === "ru" ? "Загрузка данных" : "Loading data");
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

function ProjectDataLoadError({ lang, onRetry, error, data, projectName }) {
  const ru = lang === "ru";
  const recoveryData = error?.recoveryData ?? (data?.length ? data : null);
  return (
    <section className="dataLoadError" role="alert" aria-live="assertive">
      <span className="dataLoadErrorIcon" aria-hidden="true">
        !
      </span>
      <h1>
        {ru
          ? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435"
          : "Data could not be read"}
      </h1>
      <p>
        {ru
          ? "\u0414\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430 \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u044b. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043f\u043e\u043f\u044b\u0442\u043a\u0443."
          : "The project is not treated as empty. Writes are blocked to protect existing data. Check storage and try again."}
      </p>
      <button type="button" onClick={onRetry}>
        {ru
          ? "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0447\u0442\u0435\u043d\u0438\u0435"
          : "Retry"}
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
          {ru ? "Скачать данные для восстановления" : "Download recovery data"}
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
  lang,
  loadError,
  page,
  prevPage,
  requestMonitoring,
  requestMonitoringQueue,
  requestedMonitoringLeakId,
  requestedMonitoringLeakIds,
  retryLoad,
  save,
  setPage,
  setRequestedMonitoringLeakId,
  setRequestedMonitoringLeakIds,
  sharedFilters,
  userProfile,
}) {
  const isListPage = page === "db" || page === "monitoring";

  return (
    <div
      className={`pages ${page === "map" ? "pagesMap" : ""} ${
        isListPage ? "pagesList" : ""
      }`}
    >
      <Suspense fallback={<AppLoader />}>
        {!dataLoaded && <AppLoader />}

        {isImportingProject && <AppLoader overlay label={importingDataLabel} />}

        {dataLoaded && !isImportingProject && loadError && (
          <ProjectDataLoadError
            lang={lang}
            onRetry={retryLoad}
            error={loadError}
            data={data}
            projectName={activeProject?.name}
          />
        )}
        {dataLoaded && !isImportingProject && !loadError && page === "" && (
          <MainPage
            setPage={setPage}
            data={data}
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
