import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { ProjectProvider } from "@/app/project/ProjectContext";
import { LeakFormProvider } from "@/features/leakForm/LeakFormContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary/ErrorBoundary";
import { reportWebVitals } from "@/reportWebVitals";
import "./i18n";

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
