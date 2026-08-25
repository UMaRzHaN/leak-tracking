const enabled =
  import.meta.env.DEV || import.meta.env.VITE_RENDER_METRICS === "true";

function metricsStore() {
  if (!enabled || typeof window === "undefined") return null;
  window.__RENDER_METRICS__ ??= { counts: {} };
  // Сброс кладёт новый объект, а не чистит поле у старого: замыкание живёт на
  // window и вызывается когда угодно позже, в том числе из Playwright, и на
  // существование хранилища в этот момент опереться нечем. Читатели берут
  // хранилище заново на каждый вызов, поэтому подмена объекта им безразлична.
  window.__RESET_RENDER_METRICS__ ??= () => {
    window.__RENDER_METRICS__ = { counts: {} };
  };
  return window.__RENDER_METRICS__;
}

export function recordRender(name) {
  const store = metricsStore();
  if (!store) return;
  store.counts[name] = (store.counts[name] ?? 0) + 1;
}

export function useRenderMetric(name) {
  recordRender(name);
}

export function getRenderMetrics() {
  const store = metricsStore();
  return store ? { ...store.counts } : null;
}

export function resetRenderMetrics() {
  metricsStore();
  window.__RESET_RENDER_METRICS__?.();
}
