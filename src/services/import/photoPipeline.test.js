import { describe, expect, it, vi } from "vitest";
import {
  hydrateZipPhotos,
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
  rollbackExcelImportPhotos,
} from "./photoPipeline";

describe("hydrateZipPhotos", () => {
  it("materializes a shared ZIP entry only once", async () => {
    const streamRead = vi.fn(() => {
      const handlers = {};
      return {
        on(event, handler) {
          handlers[event] = handler;
          return this;
        },
        pause() {},
        resume() {
          handlers.data(new Uint8Array([1, 2, 3]));
          handlers.end?.();
        },
      };
    });
    const zip = {
      file: vi.fn(() => ({
        name: "photos/shared.jpg",
        dir: false,
        internalStream: streamRead,
      })),
    };
    const result = await hydrateZipPhotos(
      {
        leaks: [
          {
            id: "one",
            photo: "zip:photos/shared.jpg",
            monitoringRecords: [
              {
                photo: "zip:photos/shared.jpg",
                previousPhoto: "zip:photos/shared.jpg",
              },
            ],
          },
          { id: "two", photo_after: "zip:photos/shared.jpg" },
        ],
        stats: {},
      },
      zip,
    );

    expect(streamRead).toHaveBeenCalledOnce();
    expect(zip.file).toHaveBeenCalledOnce();
    expect(result.stats).toMatchObject({
      restoredPhotos: 4,
      photoReferences: 4,
      uniquePhotoEntriesRead: 1,
    });
    expect(result.leaks[0].photo).toBe(result.leaks[1].photo_after);
    expect(result.leaks[0].monitoringRecords[0].previousPhoto).toBe(
      result.leaks[0].photo,
    );
  });
});

describe("reconcileExcelImportPhotos concurrency", () => {
  it("limits storage reads and preserves incoming leak order", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`incoming-${index + 1}`], { type: "image/jpeg" }),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeReads -= 1;
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
      { concurrency: 2, reusablePhotoConcurrency: 2 },
    );

    expect(maxActiveReads).toBeLessThanOrEqual(2);
    expect(result.leaks.map((leak) => leak.leak_id)).toEqual(
      incoming.map((leak) => leak.leak_id),
    );
    expect(result.photos).toMatchObject({ replaced: 8, toSave: 8 });
  });

  it("limits rollback deletions and continues after individual failures", async () => {
    let activeDeletes = 0;
    let maxActiveDeletes = 0;
    const attempted = [];
    const paths = Array.from({ length: 7 }, (_, index) => `idb://p-${index}`);

    await rollbackExcelImportPhotos(
      [...paths, paths[0]],
      async (path) => {
        activeDeletes += 1;
        maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes);
        await new Promise((resolve) => setTimeout(resolve, 3));
        activeDeletes -= 1;
        attempted.push(path);
        if (path === paths[2]) throw new Error("delete failed");
      },
      { concurrency: 2 },
    );

    expect(maxActiveDeletes).toBeLessThanOrEqual(2);
    expect(new Set(attempted)).toEqual(new Set(paths));
    expect(attempted).toHaveLength(paths.length);
  });

  it("does not multiply concurrency for nested monitoring photos", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const existing = Array.from({ length: 3 }, (_, leakIndex) => ({
      leak_id: `MON-${leakIndex + 1}`,
      monitoringRecords: Array.from({ length: 5 }, (_, recordIndex) => ({
        id: `R-${recordIndex + 1}`,
        photo: `idb://existing-${leakIndex + 1}-${recordIndex + 1}`,
      })),
    }));
    const incoming = existing.map((leak, leakIndex) => ({
      leak_id: leak.leak_id,
      monitoringRecords: leak.monitoringRecords.map((record, recordIndex) => ({
        id: record.id,
        photo: new Blob([`incoming-${leakIndex + 1}-${recordIndex + 1}`], {
          type: "image/jpeg",
        }),
      })),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 3));
      activeReads -= 1;
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
      { concurrency: 2, reusablePhotoConcurrency: 2 },
    );

    expect(maxActiveReads).toBeLessThanOrEqual(2);
    expect(result.leaks).toHaveLength(3);
    expect(result.photos).toMatchObject({ replaced: 15, toSave: 15 });
  });
});

/*
 * The defaults below were measured on a device, not chosen — see
 * performance/README.md. Every other test here passes its own concurrency, so
 * without these nothing would fail if someone restored the unmeasured 3.
 * They assert the observed maximum exactly: a bound of "<= 2" would keep
 * passing if a default silently dropped to 1.
 */
describe("photo pipeline default concurrency", () => {
  function createConcurrencyProbe(delayMs = 5) {
    let active = 0;
    const probe = {
      max: 0,
      async enter() {
        active += 1;
        probe.max = Math.max(probe.max, active);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        active -= 1;
      },
    };
    return probe;
  }

  it("persists photos two at a time", async () => {
    const probe = createConcurrencyProbe();
    const leaks = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`photo-${index + 1}`], { type: "image/jpeg" }),
    }));
    const savePhoto = vi.fn(async (_blob, leakId) => {
      await probe.enter();
      return `idb://saved-${leakId}`;
    });

    await persistExcelImportPhotos(leaks, savePhoto);

    expect(savePhoto).toHaveBeenCalledTimes(8);
    expect(probe.max).toBe(2);
  });

  it("rolls back deletions two at a time", async () => {
    const probe = createConcurrencyProbe();
    const paths = Array.from({ length: 8 }, (_, index) => `idb://p-${index}`);

    await rollbackExcelImportPhotos(paths, async () => {
      await probe.enter();
    });

    expect(probe.max).toBe(2);
  });

  it("builds the reusable photo map two at a time", async () => {
    const probe = createConcurrencyProbe();
    // A high explicit concurrency plus photoless incoming leaks isolates the
    // reusable-map pass: it is capped at min(concurrency, the reusable
    // default), and nothing else reaches storage.
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = existing.map((leak) => ({ leak_id: leak.leak_id }));
    const getStoredPhoto = vi.fn(async (key) => {
      await probe.enter();
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    await reconcileExcelImportPhotos(existing, incoming, getStoredPhoto, {
      concurrency: 8,
    });

    expect(getStoredPhoto).toHaveBeenCalled();
    expect(probe.max).toBe(2);
  });

  it("reconciles leaks two at a time", async () => {
    const probe = createConcurrencyProbe();
    // The reusable pass is pinned to 1 explicitly, so the maximum observed
    // across the run belongs to the per-leak pass and its default.
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`incoming-${index + 1}`], { type: "image/jpeg" }),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      await probe.enter();
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    await reconcileExcelImportPhotos(existing, incoming, getStoredPhoto, {
      reusablePhotoConcurrency: 1,
    });

    expect(probe.max).toBe(2);
  });
});

describe("photo pipeline edge cases", () => {
  it("returns leaks untouched when no savePhoto is provided", async () => {
    const leaks = [{ leak_id: "TAG-1", photo: new Blob(["x"]) }];

    await expect(persistExcelImportPhotos(leaks, undefined)).resolves.toBe(
      leaks,
    );
    await expect(
      persistExcelImportPhotos(leaks, undefined, { returnTransaction: true }),
    ).resolves.toEqual({ leaks, createdPaths: [] });
  });

  it("counts an unreadable stored photo as a replacement", async () => {
    const existing = [{ leak_id: "TAG-1", photo: "idb://broken" }];
    const incoming = [
      { leak_id: "TAG-1", photo: new Blob(["new"], { type: "image/jpeg" }) },
    ];
    const getStoredPhoto = vi.fn(async () => {
      throw new Error("storage read failed");
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
    );

    expect(getStoredPhoto).toHaveBeenCalled();
    expect(result.photos.replaced).toBe(1);
    expect(result.photos.replacedByReason.unreadable).toBe(1);
  });
});
