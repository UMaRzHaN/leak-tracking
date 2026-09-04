/**
 * Общее для обоих способов говорить с excel-воркером: разовый запрос и
 * долгоживущая сессия архива поднимают воркер одинаково и одинаково отличают
 * его отказ от отказа в работе.
 */

export class WorkerUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkerUnavailableError";
  }
}

/**
 * True for failures that say nothing about the data — the worker could not be
 * created, loaded or talked to. Work the worker rejected on its merits must
 * surface as-is.
 */
export function isWorkerUnavailableError(error) {
  return error instanceof WorkerUnavailableError;
}

/**
 * Поднимает воркер или объясняет, почему не вышло.
 *
 * @returns {{worker: Worker}|{error: WorkerUnavailableError}}
 */
export function spawnExcelWorker() {
  if (typeof Worker === "undefined") {
    return { error: new WorkerUnavailableError("Web Workers are unavailable") };
  }
  try {
    return {
      worker: new Worker(new URL("./excel.worker.js", import.meta.url), {
        type: "module",
      }),
    };
  } catch (/** @type {any} */ error) {
    // Older Android WebViews reject module workers outright.
    return {
      error: new WorkerUnavailableError(
        String(error?.message ?? "Excel worker unavailable"),
      ),
    };
  }
}
