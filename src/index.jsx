import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { ProjectProvider } from "@/app/project/ProjectContext";
import { LeakFormProvider } from "@/features/leakForm/LeakFormContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary/ErrorBoundary";
import { isNative } from "@/utils/platform";

const PwaUpdateBanner = React.lazy(
  () => import("@/components/ui/PwaUpdateBanner/PwaUpdateBanner"),
);

async function bootstrap() {
  // Awaiting the module alone is no longer enough: it only starts fetching the
  // active language's chunk, and rendering before it lands would paint raw
  // keys.
  const { ready } = await import("./i18n");
  await ready;

  if (
    isNative &&
    import.meta.env.VITE_ENABLE_NATIVE_STORAGE_PERFORMANCE === "true"
  ) {
    const { installNativeStoragePerformanceHarness } =
      await import("../performance/nativeStoragePerformanceHarness");
    installNativeStoragePerformanceHarness();
  }

  if (isNative && import.meta.env.VITE_ENABLE_IMPORT_PERFORMANCE === "true") {
    const { installImportPerformanceHarness } =
      await import("../performance/importPerformanceHarness");
    installImportPerformanceHarness();
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ProjectProvider>
          <LeakFormProvider>
            <App />
            <React.Suspense fallback={null}>
              <PwaUpdateBanner />
            </React.Suspense>
          </LeakFormProvider>
        </ProjectProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  // Loaded lazily: performance telemetry is not part of showing the first
  // screen, and web-vitals in the entry chunk pushed it past its size budget.
  void import("@/reportWebVitals").then(({ reportWebVitals }) =>
    reportWebVitals(),
  );

  if (import.meta.env.PROD && !isNative && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        const announceWaitingUpdate = () => {
          if (!registration.waiting || !navigator.serviceWorker.controller) {
            return;
          }
          window.leakTrackingWaitingServiceWorkerRegistration = registration;
          window.dispatchEvent(
            new CustomEvent("leak-tracking:update-available", {
              detail: registration,
            }),
          );
        };
        announceWaitingUpdate();
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener(
            "statechange",
            announceWaitingUpdate,
          );
        });
      })
      .catch(() => {
        // Offline support is progressive; startup must not fail if registration
        // is blocked by the browser or deployment environment.
      });
  }
}

bootstrap();
