import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildWorkbookBufferInWorker } from "./excelExportWorkerClient";

const workers = [];

class FakeWorker {
  constructor() {
    this.terminate = vi.fn();
    this.postMessage = vi.fn();
    workers.push(this);
  }
}

describe("buildWorkbookBufferInWorker", () => {
  beforeEach(() => {
    workers.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("terminates and rejects a worker that never responds", async () => {
    const pending = buildWorkbookBufferInWorker({ rows: [] });
    const rejection = expect(pending).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(120_000);

    await rejection;
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
});
