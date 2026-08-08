export const getJSZip = () => import("jszip");

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isWorkerContext() {
  const scope = globalThis.WorkerGlobalScope;
  return typeof scope !== "undefined" && globalThis instanceof scope;
}

export function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    // Inside a worker there is no main thread to yield to, and nested
    // setTimeout(0) is clamped to ~4 ms — on a 20 000-row sheet the 200 yields
    // would add about a second of pure waiting for nobody's benefit.
    if (isWorkerContext()) {
      resolve();
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return [];

  const results = new Array(items.length);
  const workerCount = Math.max(
    1,
    Math.min(
      Number.isFinite(concurrency) ? Math.floor(concurrency) : 1,
      items.length,
    ),
  );
  let cursor = 0;
  let hasError = false;
  let firstError;

  async function worker() {
    while (!hasError) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!hasError) {
          hasError = true;
          firstError = error;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (hasError) throw firstError;
  return results;
}
