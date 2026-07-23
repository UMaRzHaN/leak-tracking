const EXCEL_WORKER_TIMEOUT_MS = 120_000;

export function buildWorkbookBufferInWorker(payload) {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Web Workers are unavailable"));
  }

  const worker = new Worker(
    new URL("./excelExport.worker.js", import.meta.url),
    { type: "module" },
  );

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
      finish(reject, new Error("Excel worker timed out"));
    }, EXCEL_WORKER_TIMEOUT_MS);

    worker.onmessage = (event) => {
      if (event.data?.ok && event.data.buffer instanceof ArrayBuffer) {
        finish(resolve, event.data.buffer);
        return;
      }
      finish(
        reject,
        new Error(event.data?.error || "Excel worker returned no buffer"),
      );
    };
    worker.onerror = (event) => {
      finish(reject, new Error(event.message || "Excel worker failed"));
    };
    worker.onmessageerror = () => {
      finish(reject, new Error("Excel worker response could not be cloned"));
    };
    worker.postMessage(payload);
  });
}
