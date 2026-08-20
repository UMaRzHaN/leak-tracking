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
`concurrencies`, and `scenarios` (`backupImport`, `persist`, `reconcile`,
`hydrate`).
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

### Results — 2026-08-21, emulator, skipping work instead of doing it faster

Read these numbers as ratios, not as durations. They were taken on a Pixel 9
emulator on a desktop host, where the CPU is far quicker than a phone's and the
"device" storage is a host file: the 58 s baseline here is the same import that
takes 107 s on the Xiaomi above. What the emulator can still show honestly is
work that stopped happening at all, which is what this change is — reading a
photo's fingerprint from its file name instead of reading the file back, and
skipping compression for a JPEG already inside the storage budget.

Same fixture as above, 52,619,648 bytes, 60 photos, concurrency 2, two runs per
side, `claude/component-registry` against its parent `36fb0ff`:

| Scenario                     | before         | after             |
| ---------------------------- | -------------- | ----------------- |
| `backupImport`               | 58.2 / 59.5 s  | **12.2 / 12.3 s** |
| — main thread blocked        | 5499 / 6455 ms | **746 / 796 ms**  |
| — worst single stall         | 57 / 159 ms    | **17 / 25 ms**    |
| — `longtask` entries         | 23 / 7         | **0 / 0**         |
| `persistExcelImportPhotos`   | 52.0 s         | **5.8 s**         |
| `reconcileExcelImportPhotos` | 11.4 s         | **0.07 s**        |

All 60 leaks were restored on both sides, so the shorter run is not a shorter
import.

`reconcile` is the clean case: it read all 60 photos back through the bridge to
hash them, and now reads none, because a content-addressed file states the
fingerprint of the photo it was written from in its own name. That is the whole
scenario, hence 11.4 s → 0.07 s.

`persist` keeps every byte it used to write; what it dropped is a decode and a
JPEG re-encode per photo. That the emulator's fast CPU still shows 52 s → 5.8 s
says how much of this scenario was compression rather than the bridge. On a
phone the ratio will be smaller: the bridge half is relatively more expensive
there, and it is untouched.

So the remaining bridge cost is now the whole of what is left, and a native
write path — the one idea these measurements have not tested — has a clean floor
to be judged against.

### Results — 2026-08-21, collecting an archive without base64

The sending half of a QR transfer: one phone reads every photo it has on disk
and streams them into an archive for the other. The photos are device files, so
each one used to be read as a base64 string through the Capacitor bridge and
decoded back into bytes in JS. `Capacitor.convertFileSrc` plus `fetch` reads the
same file directly — the way a received sync archive was already being read.

Emulator again, so read the ratio and not the seconds. The `collectArchive`
scenario, 60 photos, 52.6 MB, two runs per side:

|                         | before         | after              |
| ----------------------- | -------------- | ------------------ |
| Duration                | 8767 / 8930 ms | **3085 / 2414 ms** |
| Total main-thread block | 2535 / 2931 ms | **278 / 189 ms**   |
| Worst single stall      | 97 / 209 ms    | **12 / 15 ms**     |
| `longtask` entries      | 14             | **0**              |

The archive came out byte-identical on both sides — 52,614,454 bytes every run,
which is what says the faster read returned the same photos rather than fewer.

The fallback matters as much as the speed: any failure in the direct read drops
back to the base64 path, because a photo missing from a transfer is a worse
outcome than a slow transfer.

### Results — 2026-08-21, handing the archive over without base64

The other half of a QR send: the finished archive has to reach the native side,
and the Capacitor bridge carries strings, so it went as base64 chunks — 4 bytes
of traffic per 3 bytes of archive, encoded in JavaScript and decoded in Java.
A web message listener takes an `ArrayBuffer` unchanged.

Both paths are measured **in the same run on the same bytes**, which is what
makes this table stronger than the ones above it: no rebuild, no reinstall and
no regenerated fixture sits between the two numbers.

|                          | base64 chunks  | binary channel     |
| ------------------------ | -------------- | ------------------ |
| Duration                 | 9467 / 9543 ms | **1202 / 1471 ms** |
| Total main-thread block  | 845 / 1044 ms  | **98 / 103 ms**    |
| Worst single stall       | 40 / 39 ms     | **27 / 10 ms**     |
| Bytes on the native side | 52,619,648     | **52,619,648**     |

That last row is the one worth keeping. It is read back from the native file
after the transfer, not counted in the WebView: a faster path that quietly
dropped bytes would otherwise look exactly like a win.

The channel needs two WebView features — `WEB_MESSAGE_LISTENER` and
`WEB_MESSAGE_ARRAY_BUFFER`, the second of which arrived later. Where either is
missing, `getArchiveUploadChannel` reports it unavailable and the base64 path
runs unchanged, so the slower route is not dead code: it is what old devices
still use.

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

### ZIP hydration

`hydrateZipPhotos` got its own scenario because it is a different workload:
these leaks come from an Excel-export ZIP whose photos are `zip:` references,
and hydration extracts entries in memory instead of writing through the
Filesystem bridge. Same 52,619,648-byte class of fixture, 60 photos, five
sweeps, milliseconds:

| Concurrency | Samples                 | Mean       | Spread    |
| ----------- | ----------------------- | ---------- | --------- |
| 1           | 261, 300, 282, 281, 292 | **283 ms** | 39 ms     |
| 2           | 250, 259, 248, 268, 263 | **258 ms** | 20 ms     |
| 3           | 254, 276, 257, 306, 274 | **273 ms** | **52 ms** |
| 5           | 266, 268, 263, 274, 261 | **266 ms** | 13 ms     |
| 8           | 242, 258, 256, 262, 268 | **257 ms** | 26 ms     |

The whole range of means spans 26 ms while a single concurrency varies by up to
52 ms between its own repeats — the noise is wider than the effect, so this
constant has no measurable influence on time. Worst stalls were 4–25 ms
throughout, never close to the 100 ms the persist sweep hit at 8.

The reason is the archive layout: JPEG bytes are already compressed, JSZip
stores rather than deflates them, and extraction is a memory slice. The whole
pass costs about 270 ms against the 107 s of a full import — a quarter of one
percent.

Nor is there a memory argument for a smaller value: `photoCache` inside
`hydrateZipPhotos` memoizes every entry for the duration of the call, so all 60
blobs are alive by the end whether one or eight were in flight.

`DEFAULT_ZIP_HYDRATE_CONCURRENCY` therefore stays at 3. It is the one constant
here whose value does not matter, and changing it to match the others would
imply a difference the measurement does not support.
