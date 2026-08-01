import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { ProjectProvider } from "@/app/project/ProjectContext";
import { LeakFormProvider } from "@/features/leakForm/LeakFormContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary/ErrorBoundary";
import { reportWebVitals } from "@/reportWebVitals";
import { isNative } from "@/utils/platform";

const PwaUpdateBanner = React.lazy(
  () => import("@/components/ui/PwaUpdateBanner/PwaUpdateBanner"),
);

async function bootstrap() {
  await import("./i18n");

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

  reportWebVitals();

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
