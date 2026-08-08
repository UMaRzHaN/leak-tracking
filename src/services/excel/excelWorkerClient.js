// Building one workbook is bounded work; parsing a 10 000-record archive with
// photos is not, so the two directions get different ceilings.
const EXPORT_TIMEOUT_MS = 120_000;
const IMPORT_TIMEOUT_MS = 600_000;

class WorkerUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkerUnavailableError";
  }
}

/**
 * True for failures that say nothing about the data — the worker could not be
 * created, loaded or talked to. Only these are worth retrying on the main
 * thread; work the worker rejected on its merits must surface as-is.
 */
export function isWorkerUnavailableError(error) {
  return error instanceof WorkerUnavailableError;
}

function runInExcelWorker({ kind, payload, timeoutMs, readResult }) {
  if (typeof Worker === "undefined") {
    return Promise.reject(
      new WorkerUnavailableError("Web Workers are unavailable"),
    );
  }

  let worker;
  try {
    worker = new Worker(new URL("./excel.worker.js", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    // Older Android WebViews reject module workers outright.
    return Promise.reject(
      new WorkerUnavailableError(
        String(error?.message ?? "Excel worker unavailable"),
      ),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      callback(value);
    };

    timeoutId = setTimeout(() => {
      finish(reject, new Error(`Excel worker timed out (${kind})`));
    }, timeoutMs);

    worker.onmessage = (event) => {
      if (event.data?.ok) {
        const value = readResult(event.data);
        if (value !== undefined) {
          finish(resolve, value);
          return;
        }
      }
      const message = event.data?.error || `Excel worker returned no ${kind}`;
      finish(
        reject,
        event.data?.unavailable
          ? new WorkerUnavailableError(message)
          : new Error(message),
      );
    };
    worker.onerror = (event) => {
      // Fired when the worker script fails to load or throws at module scope,
      // so the payload was never looked at.
      finish(
        reject,
        new WorkerUnavailableError(event.message || "Excel worker failed"),
      );
    };
    worker.onmessageerror = () => {
      finish(
        reject,
        new WorkerUnavailableError("Excel worker response could not be cloned"),
      );
    };

    try {
      worker.postMessage({ kind, payload });
    } catch (error) {
      // Structured clone rejected the payload — e.g. a duck-typed file object
      // rather than a real File. Nothing was sent, so the main thread can
      // still do the work.
      finish(
        reject,
        new WorkerUnavailableError(
          String(error?.message ?? "Excel worker payload could not be cloned"),
        ),
      );
    }
  });
}

export function buildWorkbookBufferInWorker(payload) {
  return runInExcelWorker({
    kind: "export",
    payload,
    timeoutMs: EXPORT_TIMEOUT_MS,
    readResult: (data) =>
      data.buffer instanceof ArrayBuffer ? data.buffer : undefined,
  });
}

export function parseExcelImportFileInWorker(file, options = {}) {
  return runInExcelWorker({
    kind: "import",
    payload: { file, options },
    timeoutMs: IMPORT_TIMEOUT_MS,
    readResult: (data) => data.result ?? undefined,
  });
}
