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

/**
 * @param {{
 *   kind: string,
 *   op?: string,
 *   payload: any,
 *   timeoutMs: number,
 *   readResult: (data: any) => any,
 * }} request `op` — уточнение вида работ: он есть у тех, у кого их несколько.
 */
function runInExcelWorker({ kind, op, payload, timeoutMs, readResult }) {
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
  } catch (/** @type {any} */ error) {
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
      // A deadline says nothing about the data, only that this worker did not
      // finish in time. Before the import ran in a worker there was no
      // deadline at all, so failing outright here would be a regression on
      // slow devices — fall back and let the main thread finish the job.
      finish(
        reject,
        new WorkerUnavailableError(`Excel worker timed out (${kind})`),
      );
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
      worker.postMessage({ kind, op, payload });
    } catch (/** @type {any} */ error) {
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

// Одна таблица, без снимков и без тысяч строк: рейс до воркера тут дороже
// самой работы. Ходим всё равно — ради того, чтобы ExcelJS остался только в
// графе воркера; поэтому и срок ожидания взят экспортный, а не импортный.
const INVENTORY_TIMEOUT_MS = EXPORT_TIMEOUT_MS;

/**
 * Читает видимый лист инвентаризации в воркере.
 *
 * Отклоняется с `WorkerUnavailableError`, если воркер не завёлся; читать книгу
 * на главном потоке взамен некому — ExcelJS туда больше не входит, — так что
 * вызывающий показывает отказ, а не досчитывает сам.
 */
export function readInventorySheetInWorker(file, excel) {
  return runInExcelWorker({
    kind: "inventory",
    op: "sheet",
    payload: { file, excel },
    timeoutMs: INVENTORY_TIMEOUT_MS,
    readResult: (data) => data.result ?? undefined,
  });
}

/**
 * Читает карточки из служебного листа книги, лежащей в архиве.
 *
 * `cards: null` означает, что служебного листа в архиве нет, и это не ошибка:
 * так выглядит зип, собранный не этим приложением.
 */
export function readInventoryArchiveCardsInWorker(file, excel) {
  return runInExcelWorker({
    kind: "inventory",
    op: "cards",
    payload: { file, excel },
    timeoutMs: INVENTORY_TIMEOUT_MS,
    readResult: (data) => data.result ?? undefined,
  });
}

/**
 * Собирает книгу инвентаризации в воркере.
 *
 * Снимки и чертежи сюда не едут: в книге от них только ссылки на пути внутри
 * архива, а сам архив складывает вызывающий — там, где эти файлы уже лежат.
 */
export function buildInventoryWorkbookBufferInWorker(sheetSpec, options = {}) {
  return runInExcelWorker({
    kind: "inventory",
    op: "workbook",
    payload: { sheetSpec, options },
    timeoutMs: INVENTORY_TIMEOUT_MS,
    readResult: (data) =>
      data.buffer instanceof ArrayBuffer ? data.buffer : undefined,
  });
}

// Photo reads run back-to-back while the main thread saves them, so a gap this
// long means the import is done and the archive can be released. There is no
// explicit close: the import path has three exits including two error paths,
// and a session that only survives while it is being used cannot be leaked by
// forgetting one of them.
const BACKUP_IDLE_MS = 30_000;

/**
 * Parses a backup archive in the worker and keeps it open there, so photos can
 * be pulled one at a time instead of crossing the boundary all at once.
 *
 * Resolves to the parse result plus a `sizes` map; the caller wraps that into a
 * reader. Rejects with WorkerUnavailableError when the worker cannot run, so
 * the caller can parse locally instead.
 */
export function openBackupArchiveInWorker(file) {
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
  } catch (/** @type {any} */ error) {
    return Promise.reject(
      new WorkerUnavailableError(
        String(error?.message ?? "Excel worker unavailable"),
      ),
    );
  }

  const pending = new Map();
  let nextId = 0;
  let idleTimer;
  let closed = false;

  const close = (error) => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer);
    worker.terminate();
    for (const { reject } of pending.values()) {
      reject(error ?? new Error("Backup archive session was closed"));
    }
    pending.clear();
  };

  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => close(), BACKUP_IDLE_MS);
  };

  const request = (op, payload) => {
    if (closed) {
      return Promise.reject(new Error("Backup archive session was closed"));
    }
    const id = (nextId += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      touch();
      try {
        worker.postMessage({ kind: "backup", op, id, payload });
      } catch (/** @type {any} */ error) {
        pending.delete(id);
        reject(
          new WorkerUnavailableError(
            String(error?.message ?? "Backup payload could not be cloned"),
          ),
        );
      }
    });
  };

  worker.onmessage = (event) => {
    const { id, ok, result, blob, error, unavailable } = event.data ?? {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    touch();
    if (ok) {
      entry.resolve(result ?? blob ?? null);
      return;
    }
    const message = error || "Backup worker returned no result";
    entry.reject(
      unavailable ? new WorkerUnavailableError(message) : new Error(message),
    );
  };
  worker.onerror = (event) => {
    close(new WorkerUnavailableError(event.message || "Excel worker failed"));
  };
  worker.onmessageerror = () => {
    close(
      new WorkerUnavailableError("Excel worker response could not be cloned"),
    );
  };

  return request("open", { file })
    .then((result) => ({
      ...result,
      readPhoto: (path) => request("readPhoto", { path }),
    }))
    .catch((error) => {
      close(error);
      throw error;
    });
}
