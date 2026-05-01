import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { ProjectProvider } from './app/project/ProjectContext';
import { LeakFormProvider } from './features/leakForm/LeakFormContext';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { reportWebVitals } from './reportWebVitals';

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
