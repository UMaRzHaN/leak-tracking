import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { ProjectProvider } from './app/settings/ProjectContext';
import { LeakFormProvider } from './context/LeakFormContext';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { reportWebVitals } from './utils/reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ProjectProvider>
        <LeakFormProvider>
          <App />
        </LeakFormProvider>
      </ProjectProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
