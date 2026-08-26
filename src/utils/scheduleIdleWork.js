import { globalScope } from "@/utils/globalScope";
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

  if (typeof globalScope.requestIdleCallback === "function") {
    const idleId = globalScope.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      globalScope.cancelIdleCallback?.(idleId);
    };
  }

  const timerId = globalScope.setTimeout(run, fallbackDelay);
  return () => {
    cancelled = true;
    globalScope.clearTimeout(timerId);
  };
}
