import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import {
  deleteNativeProjectStorage,
  getNativeStorageDiagnostics,
  loadNativeProject,
  saveNativeProject,
  writeNativeProjectSnapshot,
} from "@/repositories/nativeLeakStorage";

const DEFAULT_RECORD_COUNTS = [2_000, 10_000];
const RESULT_DIRECTORY = "LeakReports/performance-results";
const RESULT_PATH = `${RESULT_DIRECTORY}/native-storage.json`;
const REPEATED_MUTATION_COUNT = 40;

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

async function measure(operation) {
  const startedAt = now();
  const value = await operation();
  return { value, durationMs: Math.round(now() - startedAt) };
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function createPerformanceLeak(index, timestamp) {
  const sequence = index + 1;
  return {
    id: sequence,
    index: sequence,
    leak_id: `ANDROID-${String(sequence).padStart(5, "0")}`,
    video_id: `VIDEO-${String(sequence).padStart(5, "0")}`,
    date: new Date(timestamp).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: ["open", "in_progress", "resolved"][index % 3],
    priority: ["low", "medium", "high"][index % 3],
    leak_speed: Number(((index % 200) / 10 + 0.1).toFixed(1)),
    pressure: Number(((index % 80) / 10 + 0.5).toFixed(1)),
    temperature: 20 + (index % 45),
    object: `Object ${index % 100}`,
    component: `Valve ${index % 50}`,
    location: `Line ${index % 25}`,
    field: `Field ${index % 10}`,
    equipment: `Equipment ${index % 75}`,
    leak_description: `Generated Android SQLite record ${sequence}`,
    repair_recommendation: `Inspect and repair component ${index % 50}`,
    lat: 41.2 + (index % 100) / 100_000,
    lng: 69.3 + (index % 100) / 100_000,
    photo: index % 5 === 0 ? `data://photos/${sequence}.jpg` : null,
    photo_after: null,
    photo_repair: null,
    history:
      index % 20 === 0
        ? [
            {
              id: `history-${sequence}`,
              timestamp,
              action: "created",
              user: "performance-test",
            },
          ]
        : [],
    monitoringRecords:
      index % 25 === 0
        ? [
            {
              id: `monitoring-${sequence}`,
              createdAt: timestamp,
              leak_speed: Number(((index % 100) / 10 + 0.1).toFixed(1)),
              photo: null,
            },
          ]
        : [],
  };
}

function createDataset(recordCount) {
  const baseTime = Date.now() - recordCount * 60_000;
  return Array.from({ length: recordCount }, (_, index) =>
    createPerformanceLeak(index, baseTime + index * 60_000),
  );
}

function mutateRecords(records, startIndex, count, revision) {
  const next = records.slice();
  for (let offset = 0; offset < count; offset += 1) {
    const index = (startIndex + offset) % records.length;
    const current = records[index];
    next[index] = {
      ...current,
      leak_speed: Number((Number(current.leak_speed) + 0.1).toFixed(1)),
      updatedAt: Number(current.updatedAt) + revision,
      performanceRevision: revision,
    };
  }
  return next;
}

function readHeapBytes() {
  const value = globalThis.performance?.memory?.usedJSHeapSize;
  return Number.isFinite(value) ? Math.round(value) : null;
}

function assertSqliteDiagnostics(diagnostics, recordCount, operation) {
  assertCondition(
    diagnostics?.engine === "sqlite",
    `${operation} did not use SQLite`,
  );
  assertCondition(
    diagnostics.found && diagnostics.recordCount === recordCount,
    `${operation} stored ${diagnostics?.recordCount ?? 0} records instead of ${recordCount}`,
  );
}

async function runDatasetScenario(recordCount) {
  const folderName = `native_sqlite_perf_${recordCount}_${Date.now()}`;
  const dataset = createDataset(recordCount);
  const syncState = {
    projectId: folderName,
    revision: 1,
    updatedAt: Date.now(),
  };

  try {
    const initialWrite = await measure(() =>
      writeNativeProjectSnapshot(folderName, dataset, syncState),
    );
    const initialDiagnostics = await getNativeStorageDiagnostics(folderName);
    assertSqliteDiagnostics(initialDiagnostics, recordCount, "Initial write");
    assertCondition(
      initialDiagnostics.lastWriteMode === "replace" &&
        initialDiagnostics.lastChangeCount === recordCount,
      "Initial SQLite write was not recorded as a full replacement",
    );

    const coldLoad = await measure(() => loadNativeProject(folderName));
    assertCondition(
      coldLoad.value?.state?.data?.length === recordCount,
      `Cold load returned ${coldLoad.value?.state?.data?.length ?? 0} records instead of ${recordCount}`,
    );

    const heapAfterColdLoadBytes = readHeapBytes();
    const singlePrevious = coldLoad.value.state.data;
    const singleNext = mutateRecords(singlePrevious, recordCount - 1, 1, 1);
    const singleMutation = await measure(() =>
      saveNativeProject(folderName, singleNext, {
        previousLeaks: singlePrevious,
        syncState: { ...syncState, revision: 2 },
      }),
    );
    const singleDiagnostics = await getNativeStorageDiagnostics(folderName);
    assertSqliteDiagnostics(singleDiagnostics, recordCount, "Single mutation");
    assertCondition(
      singleDiagnostics.lastWriteMode === "incremental" &&
        singleDiagnostics.lastChangeCount === 1,
      "A single-record mutation did not stay incremental",
    );

    const loadAfterSingle = await measure(() => loadNativeProject(folderName));
    assertCondition(
      loadAfterSingle.value.state.data[recordCount - 1].performanceRevision === 1,
      "Single-record SQLite mutation was not restored",
    );

    const bulkCount = Math.min(100, recordCount);
    const bulkPrevious = loadAfterSingle.value.state.data;
    const bulkNext = mutateRecords(bulkPrevious, 0, bulkCount, 2);
    const bulkMutation = await measure(() =>
      saveNativeProject(folderName, bulkNext, {
        previousLeaks: bulkPrevious,
        syncState: { ...syncState, revision: 3 },
      }),
    );
    const bulkDiagnostics = await getNativeStorageDiagnostics(folderName);
    assertSqliteDiagnostics(bulkDiagnostics, recordCount, "Bulk mutation");
    assertCondition(
      bulkDiagnostics.lastWriteMode === "incremental" &&
        bulkDiagnostics.lastChangeCount === bulkCount,
      "A 100-record mutation did not stay incremental",
    );

    const loadAfterBulk = await measure(() => loadNativeProject(folderName));
    assertCondition(
      loadAfterBulk.value.state.data[0].performanceRevision === 2 &&
        loadAfterBulk.value.state.data[bulkCount - 1].performanceRevision === 2,
      "Bulk SQLite mutation was not restored",
    );

    let repeatedMutations = null;
    if (recordCount === 2_000) {
      let previous = loadAfterBulk.value.state.data;
      const durations = [];
      const startedAt = now();
      for (let index = 0; index < REPEATED_MUTATION_COUNT; index += 1) {
        const next = mutateRecords(previous, 100 + index, 1, index + 3);
        const operation = await measure(() =>
          saveNativeProject(folderName, next, {
            previousLeaks: previous,
            syncState: { ...syncState, revision: index + 4 },
          }),
        );
        durations.push(operation.durationMs);
        previous = next;
      }
      const diagnostics = await getNativeStorageDiagnostics(folderName);
      assertSqliteDiagnostics(diagnostics, recordCount, "Repeated mutations");
      assertCondition(
        diagnostics.lastWriteMode === "incremental" &&
          diagnostics.lastChangeCount === 1,
        "Repeated edits unexpectedly triggered a full replacement",
      );
      repeatedMutations = {
        durationMs: Math.round(now() - startedAt),
        mutationCount: REPEATED_MUTATION_COUNT,
        maxMutationMs: Math.max(...durations),
        averageMutationMs: Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        ),
        databaseBytes: Number(diagnostics.databaseBytes ?? 0),
        walBytes: Number(diagnostics.walBytes ?? 0),
      };
    }

    return {
      recordCount,
      engine: initialDiagnostics.engine,
      initialWriteMs: initialWrite.durationMs,
      initialDatabaseBytes:
        Number(initialDiagnostics.databaseBytes ?? 0) +
        Number(initialDiagnostics.walBytes ?? 0),
      coldLoadMs: coldLoad.durationMs,
      singleMutationMs: singleMutation.durationMs,
      singleChangedRows: singleDiagnostics.lastChangeCount,
      loadAfterSingleMs: loadAfterSingle.durationMs,
      bulkMutationCount: bulkCount,
      bulkMutationMs: bulkMutation.durationMs,
      bulkChangedRows: bulkDiagnostics.lastChangeCount,
      loadAfterBulkMs: loadAfterBulk.durationMs,
      repeatedMutations,
      heapAfterColdLoadBytes,
    };
  } finally {
    await deleteNativeProjectStorage(folderName).catch(() => {});
  }
}

function normalizeRecordCounts(recordCounts) {
  const values = Array.isArray(recordCounts)
    ? recordCounts
    : DEFAULT_RECORD_COUNTS;
  const normalized = values
    .map(Number)
    .filter(
      (value) => Number.isInteger(value) && value >= 1_000 && value <= 10_000,
    );
  assertCondition(normalized.length > 0, "No valid native record counts supplied");
  return [...new Set(normalized)];
}

async function persistResult(result) {
  await Filesystem.mkdir({
    path: RESULT_DIRECTORY,
    directory: Directory.Data,
    recursive: true,
  });
  await Filesystem.writeFile({
    path: RESULT_PATH,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(result, null, 2),
  });
}

export async function runNativeStoragePerformance(options = {}) {
  const recordCounts = normalizeRecordCounts(options.recordCounts);
  const result = {
    version: 2,
    storageEngine: "sqlite",
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    recordCounts,
    scenarios: [],
  };

  for (const recordCount of recordCounts) {
    result.scenarios.push(await runDatasetScenario(recordCount));
  }
  result.completedAt = new Date().toISOString();
  result.ok = true;
  await persistResult(result);
  return result;
}

if (import.meta.env.VITE_ENABLE_NATIVE_STORAGE_PERFORMANCE === "true") {
  window.__nativeStoragePerformance = {
    run: runNativeStoragePerformance,
    resultPath: RESULT_PATH,
  };
}
