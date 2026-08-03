/**
 * Schedule non-critical work after the first UI render without relying on
 * requestIdleCallback being available in every Android WebView.
 * Returns a cancellation function.
 */
export function scheduleIdleWork(
  work,
  { timeout = 5000, fallbackDelay = 1500 } = {},
) {
  let cancelled = false;
  const run = () => {
    if (!cancelled) work();
  };

  if (typeof globalThis.requestIdleCallback === "function") {
    const idleId = globalThis.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      globalThis.cancelIdleCallback?.(idleId);
    };
  }

  const timerId = globalThis.setTimeout(run, fallbackDelay);
  return () => {
    cancelled = true;
    globalThis.clearTimeout(timerId);
  };
}
