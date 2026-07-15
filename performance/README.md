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
search duration, bulk status persistence, Excel ZIP export, re-import preview,
archive size, rendered card count, DOM node count, and Chromium heap usage when
available. The round trip must report zero updated records and zero changed
fields. A JSON metrics attachment is written to the Playwright test results.

Default budgets can be overridden with:

- `PERF_MAX_COLD_START_MS`
- `PERF_MAX_DATABASE_OPEN_MS`
- `PERF_MAX_SEARCH_MS`
- `PERF_MAX_BULK_SAVE_MS`
- `PERF_MAX_EXCEL_EXPORT_MS`
- `PERF_MAX_EXCEL_IMPORT_MS`
- `PERF_MAX_EXPORT_HEAP_MB`
- `PERF_MAX_IMPORT_HEAP_MB`
- `PERF_MAX_SETTLED_HEAP_MB`

The performance suite uses `playwright.performance.config.mjs`; it is not
included in `npm test` or `npm run test:e2e`.
