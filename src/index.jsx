import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { ProjectProvider } from "@/app/project/ProjectContext";
import { LeakFormProvider } from "@/features/leakForm/LeakFormContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary/ErrorBoundary";
import { reportWebVitals } from "@/reportWebVitals";
import { isNative } from "@/utils/platform";

async function bootstrap() {
  await import("./i18n");

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ProjectProvider>
          <LeakFormProvider>
            <App />
          </LeakFormProvider>
        </ProjectProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  reportWebVitals();

  if (import.meta.env.PROD && !isNative && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive; startup must not fail if registration
      // is blocked by the browser or deployment environment.
    });
  }
}

bootstrap();
