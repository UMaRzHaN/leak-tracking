import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWorkerUnavailableError,
  openBackupArchiveInWorker,
} from "./backupArchiveWorkerClient";

const original = globalThis.Worker;

afterEach(() => {
  globalThis.Worker = original;
  vi.useRealTimers();
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
