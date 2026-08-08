import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { buildBackupZip } from "@/services/backup/backupExport";
import { importBackupZip } from "@/services/backup/backupImport";
import {
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
} from "@/services/import/photoPipeline";

const RESULT_DIRECTORY = "LeakReports/performance-results";
const RESULT_PATH = `${RESULT_DIRECTORY}/import.json`;
const CONFIG_PATH = `${RESULT_DIRECTORY}/import-config.json`;

const DEFAULT_OPTIONS = Object.freeze({
  // 100 photos of roughly 0.5 MB land near 55 MB of archive, which is a large
  // but importable file: IMPORT_LIMITS.maxFileBytes rejects anything past
  // 96 MB, so a bigger fixture would measure the rejection path instead.
  photoCount: 100,
  photoWidth: 1280,
  photoHeight: 960,
  photoQuality: 0.85,
  concurrencies: [1, 2, 3, 5, 8],
  seed: 20260809,
});

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Deterministic PRNG so a fixture generated on one branch is byte-identical to
 * the fixture generated on another: the before/after comparison is only honest
 * if both branches import the same archive.
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The main thread cannot report its own stalls while it is stalled, which is
 * exactly what makes a self-rescheduling timer the measurement: every
 * millisecond the tick arrives late is a millisecond the UI could not paint or
 * answer a touch. `longtask` entries are recorded too when the WebView exposes
 * them, but the timer is what survives on older Android WebViews.
 */
function startMainThreadMonitor(tickMs = 16) {
  const stalls = [];
  const longTasks = [];
  let last = now();
  let stopped = false;
  let timer = null;

  const tick = () => {
    const at = now();
    const late = at - last - tickMs;
    if (late > 0) stalls.push(late);
    last = at;
    if (!stopped) timer = setTimeout(tick, tickMs);
  };
  timer = setTimeout(tick, tickMs);

  let observer = null;
  try {
    observer = new globalThis.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    observer = null;
  }

  return {
    stop() {
      stopped = true;
      if (timer != null) clearTimeout(timer);
      try {
        observer?.disconnect();
      } catch {
        // The observer is best-effort telemetry, not part of the result.
      }
      const sum = (values) => values.reduce((total, ms) => total + ms, 0);
      return {
        blockedMs: Math.round(sum(stalls)),
        maxStallMs: Math.round(Math.max(0, ...stalls)),
        stallsOver100ms: stalls.filter((ms) => ms > 100).length,
        stallsOver500ms: stalls.filter((ms) => ms > 500).length,
        longTaskSupported: observer != null,
        longTaskCount: longTasks.length,
        longTaskTotalMs: Math.round(sum(longTasks)),
        longTaskMaxMs: Math.round(Math.max(0, ...longTasks)),
      };
    },
  };
}

async function measure(operation) {
  const monitor = startMainThreadMonitor();
  const startedAt = now();
  try {
    const value = await operation();
    return {
      value,
      durationMs: Math.round(now() - startedAt),
      mainThread: monitor.stop(),
    };
  } catch (error) {
    // The monitor has to stop even on failure, otherwise a thrown scenario
    // leaves a timer ticking through every later measurement.
    monitor.stop();
    throw error;
  }
}

function createCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToJpegBlob(canvas, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas produced no blob")),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Photographic noise rather than flat colour: a compressible fixture would
 * shrink the archive far below what a real photo set weighs, and the whole
 * point of the measurement is the byte volume moving through the pipeline.
 */
async function createNoisePhoto(random, { width, height, quality }) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = (random() * 256) | 0;
    pixels[index + 1] = (random() * 256) | 0;
    pixels[index + 2] = (random() * 256) | 0;
    pixels[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvasToJpegBlob(canvas, quality);
}

function createFixtureLeak(index, photoPath) {
  const sequence = index + 1;
  const timestamp = Date.UTC(2026, 0, 1) + sequence * 60_000;
  return {
    id: sequence,
    index: sequence,
    leak_id: `PERF-${String(sequence).padStart(5, "0")}`,
    date: new Date(timestamp).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: ["open", "in_progress", "resolved"][index % 3],
    object: `Object ${index % 100}`,
    component: `Valve ${index % 50}`,
    location: `Line ${index % 25}`,
    leak_description: `Import performance fixture ${sequence}`,
    lat: 41.2 + (index % 100) / 100_000,
    lng: 69.3 + (index % 100) / 100_000,
    photo: photoPath,
    photo_after: null,
    photo_repair: null,
    monitoringRecords: [],
  };
}

async function createPhotoBlobs(options) {
  const random = createRandom(options.seed);
  const blobs = [];
  let totalBytes = 0;
  for (let index = 0; index < options.photoCount; index += 1) {
    const blob = await createNoisePhoto(random, {
      width: options.photoWidth,
      height: options.photoHeight,
      quality: options.photoQuality,
    });
    blobs.push(blob);
    totalBytes += blob.size;
  }
  return { blobs, totalBytes };
}

function createPhotoStore(blobs) {
  const store = new Map();
  blobs.forEach((blob, index) => store.set(`perf_photo_${index + 1}`, blob));
  return {
    store,
    idbGet: async (id) => store.get(id) ?? null,
  };
}

function createSavePhoto(folderName) {
  return async (rawPhoto, leakId, excludePaths = [], saveOptions = {}) =>
    PhotoRepository.save(
      rawPhoto,
      { projectId: folderName, leakId, folderName },
      excludePaths,
      saveOptions,
    );
}

async function withPhotoFolder(label, operation) {
  // A fresh folder per run, and never a reused name: PhotoRepository.save
  // short-circuits on a content-addressed file that already exists, so leftover
  // files would turn the next run into a stat() benchmark. The timestamp also
  // steps around @capacitor/filesystem 8, whose mkdir rejects an existing
  // directory even with `recursive: true` — the same rejection that makes
  // ensurePhotoFolder throw on a second app launch.
  const folderName = `${label}-${Date.now()}`;
  await PhotoRepository.prepare({ folderName });
  try {
    return await operation(createSavePhoto(folderName));
  } finally {
    try {
      await Filesystem.rmdir({
        path: `LeakReports/${folderName}`,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // A folder that was never created is not an error worth failing on.
    }
  }
}

async function buildFixtureArchive(options) {
  const { blobs, totalBytes } = await createPhotoBlobs(options);
  const { idbGet } = createPhotoStore(blobs);
  const leaks = blobs.map((_, index) =>
    createFixtureLeak(index, `idb://perf_photo_${index + 1}`),
  );
  const archive = await buildBackupZip(leaks, idbGet);
  return {
    archive,
    photoCount: blobs.length,
    photoBytes: totalBytes,
    archiveBytes: archive.size,
  };
}

async function runBackupImportScenario(options) {
  const fixture = await buildFixtureArchive(options);
  const measured = await withPhotoFolder("perf-backup-import", (savePhoto) =>
    measure(() => importBackupZip(fixture.archive, savePhoto)),
  );
  return {
    name: "backupImport",
    photoCount: fixture.photoCount,
    photoBytes: fixture.photoBytes,
    archiveBytes: fixture.archiveBytes,
    durationMs: measured.durationMs,
    mainThread: measured.mainThread,
    restoredLeaks: measured.value?.leaks?.length ?? 0,
  };
}

async function runPersistConcurrencyScenario(options) {
  const { blobs, totalBytes } = await createPhotoBlobs(options);
  const runs = [];
  for (const concurrency of options.concurrencies) {
    // A fresh leak id per run keeps the content-addressed short-circuit out of
    // the way: identical bytes under a new key still take the full write path.
    const leaks = blobs.map((blob, index) => ({
      ...createFixtureLeak(index, null),
      leak_id: `PERF-C${concurrency}-${String(index + 1).padStart(5, "0")}`,
      photo: blob,
    }));
    const measured = await withPhotoFolder(
      `perf-persist-c${concurrency}`,
      (savePhoto) =>
        measure(() =>
          persistExcelImportPhotos(leaks, savePhoto, { concurrency }),
        ),
    );
    runs.push({
      concurrency,
      durationMs: measured.durationMs,
      mainThread: measured.mainThread,
    });
  }
  return {
    name: "persistExcelImportPhotos",
    photoCount: blobs.length,
    photoBytes: totalBytes,
    runs,
  };
}

async function runReconcileConcurrencyScenario(options) {
  const { blobs, totalBytes } = await createPhotoBlobs(options);
  const runs = [];
  for (const concurrency of options.concurrencies) {
    const measured = await withPhotoFolder(
      `perf-reconcile-c${concurrency}`,
      async (savePhoto) => {
        // Reconciliation compares incoming photos against photos already in
        // storage, so the stored side has to exist before the clock starts.
        const seeded = await persistExcelImportPhotos(
          blobs.map((blob, index) => ({
            ...createFixtureLeak(index, null),
            photo: blob,
          })),
          savePhoto,
          { concurrency: 3 },
        );
        const incoming = blobs.map((blob, index) => ({
          ...createFixtureLeak(index, null),
          photo: blob,
        }));
        return measure(() =>
          reconcileExcelImportPhotos(seeded, incoming, null, {
            concurrency,
            reusablePhotoConcurrency: concurrency,
          }),
        );
      },
    );
    runs.push({
      concurrency,
      durationMs: measured.durationMs,
      mainThread: measured.mainThread,
    });
  }
  return {
    name: "reconcileExcelImportPhotos",
    photoCount: blobs.length,
    photoBytes: totalBytes,
    runs,
  };
}

function normalizeOptions(options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const photoCount = Number(merged.photoCount);
  if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > 2_000) {
    throw new Error(`Unsupported photoCount: ${merged.photoCount}`);
  }
  const concurrencies = (
    Array.isArray(merged.concurrencies)
      ? merged.concurrencies
      : DEFAULT_OPTIONS.concurrencies
  )
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 32);
  if (concurrencies.length === 0) {
    throw new Error("No valid concurrency values supplied");
  }
  return { ...merged, photoCount, concurrencies: [...new Set(concurrencies)] };
}

async function persistResult(result) {
  try {
    await Filesystem.mkdir({
      path: RESULT_DIRECTORY,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // `recursive` does not make mkdir idempotent here: the plugin still throws
    // on an existing directory, and losing a completed measurement to that
    // would be absurd.
  }
  await Filesystem.writeFile({
    path: RESULT_PATH,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(result, null, 2),
  });
}

async function readConfig() {
  try {
    const file = await Filesystem.readFile({
      path: CONFIG_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(String(file.data));
  } catch {
    // No config file means the defaults, which is the normal case.
    return {};
  }
}

export async function runImportPerformance(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const result = {
    version: 1,
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    // Chrome-only and not in lib.dom, but it is the one number that explains a
    // device falling off a cliff the others do not.
    deviceMemoryGb:
      /** @type {Navigator & { deviceMemory?: number }} */ (navigator)
        .deviceMemory ?? null,
    options,
    scenarios: [],
  };

  const scenarios = new Set(
    Array.isArray(rawOptions.scenarios) && rawOptions.scenarios.length > 0
      ? rawOptions.scenarios
      : ["backupImport", "persist", "reconcile"],
  );

  try {
    if (scenarios.has("backupImport")) {
      result.scenarios.push(await runBackupImportScenario(options));
    }
    if (scenarios.has("persist")) {
      result.scenarios.push(await runPersistConcurrencyScenario(options));
    }
    if (scenarios.has("reconcile")) {
      result.scenarios.push(await runReconcileConcurrencyScenario(options));
    }
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.error = String(error?.stack ?? error);
  }

  result.completedAt = new Date().toISOString();
  await persistResult(result);
  return result;
}

export function installImportPerformanceHarness() {
  const performanceWindow =
    /** @type {Window & typeof globalThis & { __importPerformance?: { run: typeof runImportPerformance, resultPath: string, configPath: string } }} */ (
      window
    );
  const api = {
    run: runImportPerformance,
    resultPath: RESULT_PATH,
    configPath: CONFIG_PATH,
  };
  performanceWindow.__importPerformance = api;

  if (import.meta.env.VITE_IMPORT_PERFORMANCE_AUTORUN === "true") {
    // Nothing drives this build but the harness itself: there is no
    // instrumentation runner and no DevTools bridge, so the run has to start
    // on its own and leave the answer in a file `adb run-as` can read.
    setTimeout(() => {
      readConfig()
        .then((config) => runImportPerformance(config))
        .catch(() => {
          // runImportPerformance records its own failures in the result file.
        });
    }, 3_000);
  }

  return api;
}
