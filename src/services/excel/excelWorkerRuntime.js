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
 * Поднимает воркер.
 *
 * Отказ — это `WorkerUnavailableError` броском, а не значением: у обоих
 * вызывающих следующий шаг всё равно `Promise.reject`, и возвращать тут
 * «либо воркер, либо ошибку» значило бы разбирать эту развилку дважды.
 *
 * @returns {Worker}
 */
export function spawnExcelWorker() {
  if (typeof Worker === "undefined") {
    throw new WorkerUnavailableError("Web Workers are unavailable");
  }
  try {
    return new Worker(new URL("./excel.worker.js", import.meta.url), {
      type: "module",
    });
  } catch (/** @type {any} */ error) {
    // Older Android WebViews reject module workers outright.
    throw new WorkerUnavailableError(
      String(error?.message ?? "Excel worker unavailable"),
    );
  }
}
