import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { logger } from "@/utils/logger";

const RATING_COLOR = {
  good: "#0a0",
  "needs-improvement": "#f90",
  poor: "#d00",
};

function formatEntry(metric) {
  const { name, value, rating, delta, id } = metric;
  const unit = name === "CLS" ? "" : " ms";
  return {
    name,
    value: Math.round(value * 100) / 100 + unit,
    delta,
    rating,
    id,
  };
}

function logToConsole(metric) {
  const entry = formatEntry(metric);
  const color = RATING_COLOR[entry.rating] ?? "#888";
  const ratingSuffix = entry.rating ? ` (${entry.rating})` : "";
  logger.log(
    `%c[Web Vitals] ${entry.name}: ${entry.value}${ratingSuffix}`,
    `color: ${color}; font-weight: bold`,
    { id: entry.id, delta: entry.delta },
  );
}

// Extend this to send metrics to your analytics endpoint.
// Example: fetch('/api/vitals', { method: 'POST', body: JSON.stringify(metric) })
function sendToEndpoint(metric) {
  void metric;
  // not configured yet
}

export function reportWebVitals() {
  const report = import.meta.env.DEV ? logToConsole : sendToEndpoint;
  onCLS(report);
  // INP replaced FID, which web-vitals dropped in v4: FID measured only the
  // delay before the first interaction was handled, INP measures how long
  // every interaction actually took to show a result.
  onINP(report);
  onFCP(report);
  onLCP(report);
  onTTFB(report);
}
