# Performance tests

These Playwright tests seed IndexedDB directly and measure the real browser UI
against a production build, without slowing down the regular unit or E2E suites.

Run the default 1,000 and 10,000 record scenarios:

```powershell
npm run test:perf
```

Run only one dataset size:

```powershell
$env:PERF_RECORDS="10000"
npm run test:perf
```

`PERF_RECORDS` accepts comma-separated integers from 1,000 through 10,000.
The test reports IndexedDB seeding, cold application start, database opening,
search duration, Excel ZIP export, re-import preview, archive size, rendered card count, DOM node count, and Chromium heap usage when
available. The round trip must report zero updated records and zero changed
fields. A JSON metrics attachment is written to the Playwright test results.

The suite also verifies two storage-heavy scenarios:

- ZIP backup and reopen preview for 1,000 records with 1,000 IndexedDB photos;
- listing and clearing 2,000 cached map tiles through Settings.

Override the map-cache size with `PERF_MAP_TILES` (100 through 10,000).

Default budgets can be overridden with:

- `PERF_MAX_COLD_START_MS`
- `PERF_MAX_DATABASE_OPEN_MS`
- `PERF_MAX_SEARCH_MS`
- `PERF_MAX_EXCEL_EXPORT_MS`
- `PERF_MAX_EXCEL_IMPORT_MS`
- `PERF_MAX_EXPORT_HEAP_MB`
- `PERF_MAX_IMPORT_HEAP_MB`
- `PERF_MAX_SETTLED_HEAP_MB`
- `PERF_MAX_ZIP_EXPORT_MS`
- `PERF_MAX_ZIP_IMPORT_MS`
- `PERF_MAX_ZIP_HEAP_MB`
- `PERF_MAX_MAP_CACHE_READ_MS`
- `PERF_MAX_MAP_CACHE_CLEAR_MS`

The performance suite uses `playwright.performance.config.mjs`; it is not
included in `npm test` or `npm run test:e2e`.

## Android native storage performance

The Android instrumentation suite contains a separate native-storage scenario.
Unlike the browser performance suite, it runs inside the real Capacitor WebView
and uses the production Android SQLite plugin through the Capacitor bridge.

It measures:

- full transactional SQLite writes for 2,000 and 10,000 records;
- cold loading of ordered records and embedded sync state;
- a one-record incremental transaction;
- a 100-record incremental transaction;
- 40 consecutive one-record transactions for the 2,000-record dataset;
- database and write-ahead-log sizes reported by the native plugin.

The harness is excluded from normal production builds. Build it explicitly and
sync Android before running the dedicated instrumentation class:

```bash
npm run build -- --mode android-performance
npm run cap:sync
cd android
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.leak.tracking.NativeStoragePerformanceInstrumentedTest \
  -Pandroid.testInstrumentationRunnerArguments.nativeStoragePerformance=true
```

The generated metrics are stored in the debug application's data directory at:

```text
files/LeakReports/performance-results/native-storage.json
```

CI runs this heavier scenario once on API 35 and uploads the JSON metrics with
the Android instrumentation report. Normal Android builds do not expose the
performance harness.

## Android photo import

`importPerformanceHarness.js` answers a question the Node measurements could
not: whether a photo import freezes the UI. It runs inside the real Capacitor
WebView and samples main-thread availability with a self-rescheduling 16 ms
timer — every millisecond a tick arrives late is a millisecond the interface
could not paint or answer a touch. `longtask` entries are recorded too where
the WebView exposes them. The fixture is generated from a seeded PRNG so the
archive is byte-identical across branches; a before/after comparison is only
honest if both sides import the same bytes.

Build it in, sync, install:

```bash
VITE_ENABLE_IMPORT_PERFORMANCE=true npm run build && npm run cap:sync
```

Then `cd android && ./gradlew assembleDebug installDebug`.

The harness exposes `window.__importPerformance.run(options)` and writes its
result to `files/LeakReports/performance-results/import.json`. Options are
`photoCount`, `photoWidth`, `photoHeight`, `photoQuality`, `seed`,
`concurrencies`, and `scenarios` (`backupImport`, `persist`, `reconcile`).
Setting `VITE_IMPORT_PERFORMANCE_AUTORUN=true` starts a run three seconds after
launch, reading overrides from `import-config.json` next to the result file.

Drive it over the WebView debugger when the device blocks input injection, as
MIUI does — `adb shell input tap` fails there with `INJECT_EVENTS`:

```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.leak.tracking.debug)
```

Take `webSocketDebuggerUrl` from `http://127.0.0.1:9222/json` and call `run`
over `Runtime.evaluate`. Start the promise and poll a global for the result
rather than awaiting it in the CDP call: a multi-minute `awaitPromise` is a
good way to lose a finished measurement to a transport timeout. Fixture
generation costs roughly 2.5 s per photo and is repeated per scenario, so run
scenarios separately and keep each under the device's screen timeout — a
sleeping screen throttles timers and corrupts the stall metric. Check
`adb shell dumpsys power | grep mWakefulness` after every run.

### Results — 2026-08-09, Xiaomi M2012K11AI, Android 13, 8 cores, 4 GB

Import of a 52,619,648-byte archive (60 photos, 52.6 MB), three runs per
branch, `claude/import-worker` against `claude/audit-8xtps4` (before the
worker):

|                         | with worker                           | before worker                         |
| ----------------------- | ------------------------------------- | ------------------------------------- |
| Duration                | 107.8 / 106.9 / 106.6 s → **107.1 s** | 107.7 / 107.6 / 107.6 s → **107.7 s** |
| Total main-thread block | 4476 / 4067 / 4153 ms → **4232 ms**   | 4554 / 4389 / 4316 ms → **4420 ms**   |
| **Worst single stall**  | 35 / 32 / 36 ms → **34 ms**           | 112 / 81 / 94 ms → **96 ms**          |
| Stalls over 100 ms      | 0 / 0 / 0                             | 1 / 0 / 0                             |
| `longtask` entries      | 0 / 0 / 0                             | 2 / 1 / 1, up to 96 ms                |

Throughput did not move: 107.1 s against 107.7 s, a 0.5% difference against a
±0.6% spread between runs. The worker bought responsiveness, not speed — the
worst single stall fell threefold and long tasks disappeared. The 4.2 s that
remain are not the worker's: they are many 30–35 ms delays from base64 crossing
the Capacitor Filesystem bridge, and they are the same on both branches.

### Photo concurrency

`persistExcelImportPhotos`, 40 photos / 35 MB. The sweep is sequential, so the
position of a value in the queue is otherwise perfectly correlated with the
value itself; the third column reruns it in reverse to break that.

| Concurrency | Run 1  | Run 2  | Reversed order | Worst stall                       |
| ----------- | ------ | ------ | -------------- | --------------------------------- |
| 1           | 72.1 s | 72.1 s | 71.9 s         | 30–32 ms                          |
| **2**       | 41.5 s | 43.8 s | 43.2 s         | 43–47 ms                          |
| 3           | 46.7 s | 51.7 s | 44.9 s         | 28–75 ms                          |
| 5           | 41.5 s | 43.2 s | 34.1 s         | 50–88 ms                          |
| 8           | 43.2 s | 46.8 s | 36.2 s         | 115–143 ms, over 100 ms every run |

`reconcileExcelImportPhotos`, same fixture: 10.7 s at 1, then flat — 8.1 s at
2, 8.3 s at 3, 8.4 s at 5, 8.3 s at 8.

Serial concurrency is reproducible to 0.2% across positions (72.09 / 72.08 /
71.93 s), which rules out thermal drift, but 5 and 8 run appreciably faster
when they go first. The ordering test therefore refuses to rank 2 against 5.
What survives both orders: 1 is bad; 2 is stable in every position; 3 is slower
than 2 in all three sweeps; 8 stalls the main thread past 100 ms every time.

So `DEFAULT_PHOTO_PERSIST_CONCURRENCY`, `DEFAULT_PHOTO_RECONCILE_CONCURRENCY`
and `DEFAULT_REUSABLE_PHOTO_CONCURRENCY` are 2. The previous 3 was picked
without measurement and happened to land in a local pessimum.

`DEFAULT_ZIP_HYDRATE_CONCURRENCY` is untouched at 3: no scenario covers it, and
it is a different workload — hydration inflates entries of an already-parsed
ZIP in memory, while these numbers came from Filesystem writes. It needs its
own scenario before it gets a number.
