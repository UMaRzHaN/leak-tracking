import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

const isDev = import.meta.env.DEV;

const RATING_COLOR = { good: '#0a0', 'needs-improvement': '#f90', poor: '#d00' };

function formatEntry(metric) {
  const { name, value, rating, delta, id } = metric;
  const unit = name === 'CLS' ? '' : ' ms';
  return { name, value: Math.round(value * 100) / 100 + unit, delta, rating, id };
}

function logToConsole(metric) {
  const entry = formatEntry(metric);
  const color = RATING_COLOR[entry.rating] ?? '#888';
  console.groupCollapsed(
    `%c[Web Vitals] ${entry.name}: ${entry.value} (${entry.rating})`,
    `color: ${color}; font-weight: bold`,
  );
  console.log('id:', entry.id);
  console.log('delta:', entry.delta);
  console.groupEnd();
}

// Extend this to send metrics to your analytics endpoint.
// Example: fetch('/api/vitals', { method: 'POST', body: JSON.stringify(metric) })
function sendToEndpoint(_metric) {
  // not configured yet
}

export function reportWebVitals() {
  const report = isDev ? logToConsole : sendToEndpoint;
  getCLS(report);
  getFID(report);
  getFCP(report);
  getLCP(report);
  getTTFB(report);
}
