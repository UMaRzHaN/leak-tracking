import {
  isWorkerUnavailableError,
  spawnExcelWorker,
  WorkerUnavailableError,
} from "@/services/excel/excelWorkerRuntime";

export { isWorkerUnavailableError };

// Building one workbook is bounded work; parsing a 10 000-record archive with
// photos is not, so the two directions get different ceilings.
const EXPORT_TIMEOUT_MS = 120_000;
const IMPORT_TIMEOUT_MS = 600_000;

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
  const spawned = spawnExcelWorker();
  if (spawned.error) return Promise.reject(spawned.error);
  const { worker } = spawned;

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
