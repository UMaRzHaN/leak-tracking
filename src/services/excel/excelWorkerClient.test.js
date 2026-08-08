import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkbookBufferInWorker,
  isWorkerUnavailableError,
  openBackupArchiveInWorker,
  parseExcelImportFileInWorker,
} from "./excelWorkerClient";

const original = globalThis.Worker;

function installWorker(behaviour) {
  const instances = [];
  globalThis.Worker = class {
    constructor() {
      this.terminate = vi.fn();
      instances.push(this);
    }
    postMessage(payload) {
      behaviour(this, payload);
    }
  };
  return instances;
}

afterEach(() => {
  globalThis.Worker = original;
  vi.useRealTimers();
});

describe("parseExcelImportFileInWorker", () => {
  it("resolves with the parsed result and terminates the worker", async () => {
    const instances = installWorker((worker, payload) => {
      expect(payload).toEqual({
        kind: "import",
        payload: { file: "file-handle", options: { projectType: "upstream" } },
      });
      worker.onmessage({ data: { ok: true, result: { leaks: [1] } } });
    });

    await expect(
      parseExcelImportFileInWorker("file-handle", { projectType: "upstream" }),
    ).resolves.toEqual({ leaks: [1] });
    expect(instances[0].terminate).toHaveBeenCalled();
  });

  it("propagates a parse failure without marking the worker unavailable", async () => {
    installWorker((worker) => {
      worker.onmessage({ data: { ok: false, error: "В ZIP не найден .xlsx" } });
    });

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);
    expect(error.message).toBe("В ZIP не найден .xlsx");
    expect(isWorkerUnavailableError(error)).toBe(false);
  });

  it("marks a worker that failed to load as unavailable", async () => {
    installWorker((worker) => {
      worker.onerror({ message: "boom" });
    });

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);
    expect(isWorkerUnavailableError(error)).toBe(true);
  });

  it("marks an uncloneable response as unavailable", async () => {
    installWorker((worker) => {
      worker.onmessageerror();
    });

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);
    expect(isWorkerUnavailableError(error)).toBe(true);
  });

  it("marks a missing Worker constructor as unavailable", async () => {
    globalThis.Worker = undefined;

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);
    expect(isWorkerUnavailableError(error)).toBe(true);
  });

  it("falls back when the payload cannot be cloned", async () => {
    const instances = [];
    globalThis.Worker = class {
      constructor() {
        this.terminate = vi.fn();
        instances.push(this);
      }
      postMessage() {
        throw new DOMException("could not be cloned", "DataCloneError");
      }
    };

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);

    expect(isWorkerUnavailableError(error)).toBe(true);
    expect(instances[0].terminate).toHaveBeenCalled();
  });

  it("treats a worker-reported unavailable reply as a fallback signal", async () => {
    installWorker((worker) => {
      worker.onmessage({
        data: { ok: false, unavailable: true, error: "could not read request" },
      });
    });

    const error = await parseExcelImportFileInWorker("f").catch((e) => e);

    expect(isWorkerUnavailableError(error)).toBe(true);
  });

  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    const instances = installWorker(() => {});

    const pending = parseExcelImportFileInWorker("f").catch((e) => e);
    await vi.advanceTimersByTimeAsync(600_001);

    const error = await pending;
    expect(error.message).toMatch("timed out");
    // A timeout must fall back to the main thread rather than fail the import.
    expect(isWorkerUnavailableError(error)).toBe(true);
    expect(instances[0].terminate).toHaveBeenCalled();
  });
});

describe("buildWorkbookBufferInWorker", () => {
  it("resolves with the transferred buffer", async () => {
    const buffer = new ArrayBuffer(8);
    installWorker((worker, payload) => {
      expect(payload.kind).toBe("export");
      worker.onmessage({ data: { ok: true, buffer } });
    });

    await expect(buildWorkbookBufferInWorker({ rows: [] })).resolves.toBe(
      buffer,
    );
  });

  it("rejects when the worker returns something that is not a buffer", async () => {
    installWorker((worker) => {
      worker.onmessage({ data: { ok: true, buffer: "not-a-buffer" } });
    });

    await expect(buildWorkbookBufferInWorker({})).rejects.toThrow(
      "returned no export",
    );
  });
});

describe("openBackupArchiveInWorker", () => {
  function installSessionWorker(handle) {
    const instances = [];
    globalThis.Worker = class {
      constructor() {
        this.terminate = vi.fn();
        instances.push(this);
      }
      postMessage(message) {
        handle(this, message);
      }
    };
    return instances;
  }

  it("returns the parse result and reads photos on demand", async () => {
    const blob = new Blob(["photo"]);
    installSessionWorker((worker, { op, id, payload }) => {
      if (op === "open") {
        worker.onmessage({
          data: {
            ok: true,
            id,
            result: { leaks: [{ id: 1 }], sizes: { "zip:a.jpg": 5 } },
          },
        });
        return;
      }
      expect(payload.path).toBe("zip:a.jpg");
      worker.onmessage({ data: { ok: true, id, blob } });
    });

    const session = await openBackupArchiveInWorker("archive");

    expect(session.leaks).toEqual([{ id: 1 }]);
    expect(session.sizes).toEqual({ "zip:a.jpg": 5 });
    await expect(session.readPhoto("zip:a.jpg")).resolves.toBe(blob);
  });

  it("matches replies to their requests when they arrive out of order", async () => {
    const replies = [];
    installSessionWorker((worker, { op, id, payload }) => {
      if (op === "open") {
        worker.onmessage({ data: { ok: true, id, result: { sizes: {} } } });
        return;
      }
      replies.push(() =>
        worker.onmessage({ data: { ok: true, id, blob: payload.path } }),
      );
    });

    const session = await openBackupArchiveInWorker("archive");
    const first = session.readPhoto("zip:first.jpg");
    const second = session.readPhoto("zip:second.jpg");

    replies.reverse().forEach((send) => send());

    await expect(first).resolves.toBe("zip:first.jpg");
    await expect(second).resolves.toBe("zip:second.jpg");
  });

  it("releases the archive once reads stop", async () => {
    vi.useFakeTimers();
    const instances = installSessionWorker((worker, { id }) => {
      worker.onmessage({ data: { ok: true, id, result: { sizes: {} } } });
    });

    const session = await openBackupArchiveInWorker("archive");
    await vi.advanceTimersByTimeAsync(30_001);

    expect(instances[0].terminate).toHaveBeenCalled();
    await expect(session.readPhoto("zip:a.jpg")).rejects.toThrow("closed");
  });

  it("reports a worker that dies mid-session as unavailable", async () => {
    let liveWorker;
    installSessionWorker((worker, { op, id }) => {
      liveWorker = worker;
      if (op === "open") {
        worker.onmessage({ data: { ok: true, id, result: { sizes: {} } } });
      }
    });

    const session = await openBackupArchiveInWorker("archive");
    const pending = session.readPhoto("zip:a.jpg").catch((error) => error);
    liveWorker.onerror({ message: "worker died" });

    expect(isWorkerUnavailableError(await pending)).toBe(true);
  });

  it("marks a failed open as unavailable so the caller can parse locally", async () => {
    globalThis.Worker = undefined;

    const error = await openBackupArchiveInWorker("archive").catch((e) => e);

    expect(isWorkerUnavailableError(error)).toBe(true);
  });
});
