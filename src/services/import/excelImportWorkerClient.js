// Parsing a 10 000-record archive with photos takes far longer than building
// one workbook, so this ceiling is well above the export worker's.
const IMPORT_WORKER_TIMEOUT_MS = 600_000;

export function isImportWorkerSupported() {
  return typeof Worker !== "undefined";
}

/**
 * Marks failures that say nothing about the file itself — the worker could not
 * be created, loaded or talked to. Only these are worth retrying locally; a
 * rejected parse must surface as-is instead of silently reparsing on the main
 * thread.
 */
class WorkerUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkerUnavailableError";
  }
}

function workerUnavailable(message) {
  return new WorkerUnavailableError(message);
}

export function isWorkerUnavailableError(error) {
  return error instanceof WorkerUnavailableError;
}

/**
 * Runs the Excel/ZIP import parser off the main thread.
 * Rejects if workers are unavailable; callers fall back to the local parser.
 */
export function parseExcelImportFileInWorker(file, options = {}) {
  if (!isImportWorkerSupported()) {
    return Promise.reject(workerUnavailable("Web Workers are unavailable"));
  }

  let worker;
  try {
    worker = new Worker(new URL("./excelImport.worker.js", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    // Older Android WebViews reject module workers outright.
    return Promise.reject(
      workerUnavailable(String(error?.message ?? "Import worker unavailable")),
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
      finish(reject, new Error("Import worker timed out"));
    }, IMPORT_WORKER_TIMEOUT_MS);

    worker.onmessage = (event) => {
      if (event.data?.ok && event.data.result) {
        finish(resolve, event.data.result);
        return;
      }
      finish(
        reject,
        new Error(event.data?.error || "Import worker returned no result"),
      );
    };
    worker.onerror = (event) => {
      // Fired when the worker script itself fails to load or throws at
      // module scope — the file was never looked at.
      finish(
        reject,
        workerUnavailable(event.message || "Import worker failed"),
      );
    };
    worker.onmessageerror = () => {
      finish(
        reject,
        workerUnavailable("Import worker response could not be cloned"),
      );
    };

    worker.postMessage({ file, options });
  });
}
