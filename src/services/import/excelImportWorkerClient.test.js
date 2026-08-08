import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWorkerUnavailableError,
  parseExcelImportFileInWorker,
} from "./excelImportWorkerClient";

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
      expect(payload.file).toBe("file-handle");
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

  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    const instances = installWorker(() => {});

    const pending = parseExcelImportFileInWorker("f").catch((e) => e);
    await vi.advanceTimersByTimeAsync(600_001);

    expect((await pending).message).toMatch("timed out");
    expect(instances[0].terminate).toHaveBeenCalled();
  });
});
