import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import JSZip from "jszip";

const DEFAULT_RECORD_COUNTS = [1_000, 10_000];

function readRecordCounts() {
  if (!process.env.PERF_RECORDS) return DEFAULT_RECORD_COUNTS;

  const counts = process.env.PERF_RECORDS.split(",")
    .map((value) => Number(value.trim()))
    .filter(
      (value) => Number.isInteger(value) && value >= 1_000 && value <= 10_000,
    );

  if (counts.length === 0) {
    throw new Error(
      "PERF_RECORDS must contain comma-separated integers from 1000 to 10000",
    );
  }

  return [...new Set(counts)];
}

function getBudgets(recordCount) {
  const largeDataset = recordCount > 1_000;
  const megabytes = (value) => Number(value) * 1024 * 1024;
  return {
    coldStartMs: Number(
      process.env.PERF_MAX_COLD_START_MS ?? (largeDataset ? 10_000 : 6_000),
    ),
    databaseOpenMs: Number(
      process.env.PERF_MAX_DATABASE_OPEN_MS ?? (largeDataset ? 6_000 : 4_000),
    ),
    searchMs: Number(
      process.env.PERF_MAX_SEARCH_MS ?? (largeDataset ? 2_500 : 1_500),
    ),

    excelExportMs: Number(
      process.env.PERF_MAX_EXCEL_EXPORT_MS ?? (largeDataset ? 60_000 : 30_000),
    ),
    excelImportMs: Number(
      process.env.PERF_MAX_EXCEL_IMPORT_MS ?? (largeDataset ? 60_000 : 30_000),
    ),
    exportHeapBytes: megabytes(
      process.env.PERF_MAX_EXPORT_HEAP_MB ?? (largeDataset ? 96 : 48),
    ),
    importHeapBytes: megabytes(
      process.env.PERF_MAX_IMPORT_HEAP_MB ?? (largeDataset ? 320 : 128),
    ),
    settledHeapBytes: megabytes(
      process.env.PERF_MAX_SETTLED_HEAP_MB ?? (largeDataset ? 80 : 48),
    ),
  };
}

async function readUsedJsHeap(page) {
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

async function readV8Heap(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const usage = await session.send("Runtime.getHeapUsage");
    return Math.round(usage.usedSize);
  } finally {
    await session.detach();
  }
}

async function collectChromiumGarbage(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
  } finally {
    await session.detach();
  }
}

async function seedProject(page, recordCount, { photoCount = 0 } = {}) {
  return page.evaluate(
    async ({ count, requestedPhotoCount }) => {
      const startedAt = performance.now();
      const storedPhotoCount = Math.min(count, requestedPhotoCount);
      const projectId = `perf-${count}`;
      const project = {
        id: projectId,
        name: `Performance ${count}`,
        type: "upstream",
        folderName: projectId,
        createdAt: Date.now(),
      };
      const statuses = ["open", "in_progress", "resolved"];
      const priorities = ["low", "medium", "high"];
      const baseTime = Date.now() - count * 60_000;
      const leaks = Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        const timestamp = baseTime + sequence * 60_000;
        return {
          id: sequence,
          index: sequence,
          leak_id: `PERF-${String(sequence).padStart(5, "0")}`,
          date: new Date(timestamp).toLocaleDateString("ru-RU"),
          createdAt: timestamp,
          updatedAt: timestamp,
          status: statuses[index % statuses.length],
          priority: priorities[index % priorities.length],
          leak_speed: (index % 200) / 10 + 0.1,
          object: `Object ${index % 100}`,
          component: `Valve ${index % 50}`,
          location: `Line ${index % 25}`,
          field: `Field ${index % 10}`,
          leak_description: `Generated performance record ${sequence}`,
          lat: 41.2 + (index % 100) / 100_000,
          lng: 69.3 + (index % 100) / 100_000,
          photo:
            index < storedPhotoCount
              ? `idb://photo_${projectId}_${sequence}_perf`
              : null,
          photo_after: null,
          photo_repair: null,
          history: [],
          monitoringRecords: [],
        };
      });

      localStorage.clear();
      localStorage.setItem("app_language", "en");
      localStorage.setItem("app:projects_v1", JSON.stringify([project]));
      localStorage.setItem("app:active_id_v1", projectId);

      await new Promise((resolve, reject) => {
        const request = indexedDB.open("LeakTrackingDataDB", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("projects")) {
            db.createObjectStore("projects", { keyPath: "id" });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("projects", "readwrite");
          transaction.objectStore("projects").put({
            id: projectId,
            data: leaks,
            timestamp: Date.now(),
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      });

      if (storedPhotoCount > 0) {
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("LeakTrackingDB", 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("photos")) {
              db.createObjectStore("photos", { keyPath: "id" });
            }
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("photos", "readwrite");
            const store = transaction.objectStore("photos");
            const photoBytes = new Uint8Array(4 * 1024);
            for (let index = 0; index < storedPhotoCount; index++) {
              store.put({
                id: `photo_${projectId}_${index + 1}_perf`,
                data: new Blob([photoBytes], { type: "image/jpeg" }),
                timestamp: Date.now(),
              });
            }
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          };
        });
      }

      return performance.now() - startedAt;
    },
    { count: recordCount, requestedPhotoCount: photoCount },
  );
}

for (const recordCount of readRecordCounts()) {
  test(`loads and round-trips ${recordCount.toLocaleString("en-US")} records`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const budgets = getBudgets(recordCount);
    await page.goto("/");

    const seedMs = await seedProject(page, recordCount);
    const coldStartStartedAt = Date.now();
    await page.reload();
    await expect(
      page.getByText(`Performance ${recordCount}`, { exact: true }),
    ).toBeVisible({ timeout: budgets.coldStartMs + 5_000 });
    const coldStartMs = Date.now() - coldStartStartedAt;

    await page.evaluate(() => window.__RESET_RENDER_METRICS__?.());
    const databaseStartedAt = Date.now();
    await page.getByRole("button", { name: "Database", exact: true }).click();
    await expect(
      page.getByText(`${recordCount} records`, { exact: false }).first(),
    ).toBeVisible({ timeout: budgets.databaseOpenMs + 5_000 });
    const databaseOpenMs = Date.now() - databaseStartedAt;

    const renderedCards = page.locator("[data-urgency]");
    const virtualizedCardCount = await renderedCards.count();
    expect(virtualizedCardCount).toBeGreaterThan(0);
    expect(virtualizedCardCount).toBeLessThan(60);

    const targetTag = `PERF-${String(recordCount).padStart(5, "0")}`;
    const searchInput = page.getByRole("textbox", { name: "Search leaks" });
    const searchStartedAt = Date.now();
    await searchInput.fill(targetTag);
    await expect(renderedCards).toHaveCount(1);
    await expect(renderedCards.first()).toContainText(targetTag);
    const searchMs = Date.now() - searchStartedAt;

    await searchInput.fill("");
    await expect(
      page.getByText(`${recordCount} records`, { exact: false }).first(),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download", {
      timeout: budgets.excelExportMs + 5_000,
    });
    const excelExportStartedAt = Date.now();
    await page.getByRole("button", { name: /XLSX$/ }).click();
    const download = await downloadPromise;
    const downloadPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(downloadPath);
    const excelExportMs = Date.now() - excelExportStartedAt;
    const archiveBytes = (await stat(downloadPath)).size;
    expect(archiveBytes).toBeGreaterThan(0);
    const heapAfterExportBytes = await readUsedJsHeap(page);
    const v8HeapAfterExportBytes = await readV8Heap(page);

    await page.getByTitle("Settings").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import Excel", exact: true })
      .click();
    const fileChooser = await fileChooserPromise;
    const excelImportStartedAt = Date.now();
    await fileChooser.setFiles(downloadPath);
    await expect(
      page.getByRole("heading", { name: "Project already exists" }),
    ).toBeVisible({ timeout: budgets.excelImportMs + 5_000 });
    const excelImportMs = Date.now() - excelImportStartedAt;
    await expect(
      page.getByText("Updated", { exact: true }).locator(".."),
    ).toContainText("0");
    await expect(
      page.getByText("Skipped", { exact: true }).locator(".."),
    ).toContainText(String(recordCount));
    await expect(
      page.getByText("Changed fields", { exact: true }).locator(".."),
    ).toContainText("0");
    const heapAfterImportBytes = await readUsedJsHeap(page);
    const v8HeapAfterImportBytes = await readV8Heap(page);
    await collectChromiumGarbage(page);
    const heapAfterGcBytes = await readUsedJsHeap(page);
    const v8HeapAfterGcBytes = await readV8Heap(page);

    const browserStats = await page.evaluate(() => ({
      domNodes: document.getElementsByTagName("*").length,
      renderMetrics: window.__RENDER_METRICS__
        ? { ...window.__RENDER_METRICS__.counts }
        : null,
      excelPhases: window.__EXCEL_EXPORT_METRICS__
        ? { ...window.__EXCEL_EXPORT_METRICS__ }
        : null,
    }));
    const metrics = {
      recordCount,
      seedMs: Math.round(seedMs),
      coldStartMs,
      databaseOpenMs,
      searchMs,
      excelExportMs,
      excelImportMs,
      archiveBytes,
      heapAfterExportBytes,
      heapAfterImportBytes,
      heapAfterGcBytes,
      v8HeapAfterExportBytes,
      v8HeapAfterImportBytes,
      v8HeapAfterGcBytes,
      virtualizedCardCount,
      ...browserStats,
      budgets,
    };

    console.log(`[performance] ${JSON.stringify(metrics)}`);
    await testInfo.attach(`performance-${recordCount}.json`, {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });

    expect(coldStartMs).toBeLessThan(budgets.coldStartMs);
    expect(databaseOpenMs).toBeLessThan(budgets.databaseOpenMs);
    expect(searchMs).toBeLessThan(budgets.searchMs);
    expect(excelExportMs).toBeLessThan(budgets.excelExportMs);
    expect(excelImportMs).toBeLessThan(budgets.excelImportMs);
    expect(v8HeapAfterExportBytes).toBeLessThan(budgets.exportHeapBytes);
    expect(v8HeapAfterImportBytes).toBeLessThan(budgets.importHeapBytes);
    expect(v8HeapAfterGcBytes).toBeLessThan(budgets.settledHeapBytes);
    if (browserStats.renderMetrics) {
      expect(browserStats.renderMetrics.DataBase ?? 0).toBeLessThan(40);
      expect(browserStats.renderMetrics.VirtualizedLeakList ?? 0).toBeLessThan(
        100,
      );
      expect(browserStats.renderMetrics.LeakCardCompact ?? 0).toBeLessThan(250);
    }
  });
}

test("backs up and reopens 1,000 records with 1,000 photos", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const maxExportMs = Number(process.env.PERF_MAX_ZIP_EXPORT_MS ?? 60_000);
  const maxImportMs = Number(process.env.PERF_MAX_ZIP_IMPORT_MS ?? 30_000);
  const maxHeapBytes =
    Number(process.env.PERF_MAX_ZIP_HEAP_MB ?? 192) * 1024 * 1024;

  await page.goto("/");
  const seedMs = await seedProject(page, 1_000, { photoCount: 1_000 });
  await page.reload();
  await expect(
    page.getByText("Performance 1000", { exact: true }),
  ).toBeVisible();
  await page.getByTitle("Settings").click();

  const downloadPromise = page.waitForEvent("download", {
    timeout: maxExportMs + 5_000,
  });
  const exportStartedAt = Date.now();
  await page.getByRole("button", { name: "Export ZIP", exact: true }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(backupPath);
  const zipExportMs = Date.now() - exportStartedAt;
  const archiveBytes = (await stat(backupPath)).size;
  const archive = await JSZip.loadAsync(await readFile(backupPath));
  const archivedPhotos = Object.values(archive.files).filter(
    (entry) => !entry.dir && entry.name.startsWith("photos/"),
  ).length;
  expect(archivedPhotos).toBe(1_000);

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import ZIP", exact: true }).click();
  const fileChooser = await fileChooserPromise;
  const importStartedAt = Date.now();
  await fileChooser.setFiles(backupPath);
  await expect(
    page.getByRole("heading", { name: "Project already exists" }),
  ).toBeVisible({ timeout: maxImportMs + 5_000 });
  const zipImportMs = Date.now() - importStartedAt;
  const v8HeapBytes = await readV8Heap(page);

  const metrics = {
    records: 1_000,
    photos: archivedPhotos,
    seedMs: Math.round(seedMs),
    zipExportMs,
    zipImportMs,
    archiveBytes,
    v8HeapBytes,
    budgets: { maxExportMs, maxImportMs, maxHeapBytes },
  };
  console.log(`[performance-zip] ${JSON.stringify(metrics)}`);
  await testInfo.attach("performance-zip-photos.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });

  expect(zipExportMs).toBeLessThan(maxExportMs);
  expect(zipImportMs).toBeLessThan(maxImportMs);
  expect(v8HeapBytes).toBeLessThan(maxHeapBytes);
});

test("lists and clears a large offline map cache", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const requestedCount = Number(process.env.PERF_MAP_TILES ?? 2_000);
  if (
    !Number.isInteger(requestedCount) ||
    requestedCount < 100 ||
    requestedCount > 10_000
  ) {
    throw new Error("PERF_MAP_TILES must be an integer from 100 to 10000");
  }
  const maxReadMs = Number(process.env.PERF_MAX_MAP_CACHE_READ_MS ?? 8_000);
  const maxClearMs = Number(process.env.PERF_MAX_MAP_CACHE_CLEAR_MS ?? 8_000);

  await page.goto("/");
  await page.evaluate(() => {
    const project = {
      id: "perf-map-cache",
      name: "Performance Map Cache",
      type: "upstream",
      folderName: "perf-map-cache",
      createdAt: Date.now(),
    };
    localStorage.clear();
    localStorage.setItem("app_language", "en");
    localStorage.setItem("app:projects_v1", JSON.stringify([project]));
    localStorage.setItem("app:active_id_v1", project.id);
  });
  await page.reload();
  await expect(
    page.getByText("Performance Map Cache", { exact: true }),
  ).toBeVisible();

  const cacheSeedMs = await page.evaluate(async (count) => {
    const startedAt = performance.now();
    const cache = await caches.open("map-tiles-v2");
    const bytes = new Uint8Array(1024);
    for (let offset = 0; offset < count; offset += 100) {
      await Promise.all(
        Array.from(
          { length: Math.min(100, count - offset) },
          (_, relativeIndex) => {
            const index = offset + relativeIndex;
            return cache.put(
              `https://tiles.example.test/performance/${index}`,
              new Response(bytes, {
                headers: { "content-type": "image/jpeg" },
              }),
            );
          },
        ),
      );
    }
    return performance.now() - startedAt;
  }, requestedCount);

  const readStartedAt = Date.now();
  await page.getByTitle("Settings").click();
  await expect(
    page.getByText(`${requestedCount} tiles`, { exact: false }),
  ).toBeVisible({
    timeout: maxReadMs + 5_000,
  });
  const cacheReadMs = Date.now() - readStartedAt;

  await page
    .getByRole("button", { name: "Clear Offline Map Cache", exact: true })
    .click();
  const clearStartedAt = Date.now();
  await page
    .getByRole("button", { name: "Clear Offline Map Cache", exact: true })
    .last()
    .click();
  await expect(page.getByText("Cache is empty", { exact: true })).toBeVisible({
    timeout: maxClearMs + 5_000,
  });
  const cacheClearMs = Date.now() - clearStartedAt;
  const remainingEntries = await page.evaluate(async () => {
    const cache = await caches.open("map-tiles-v2");
    return (await cache.keys()).length;
  });
  expect(remainingEntries).toBe(0);

  const metrics = {
    tileCount: requestedCount,
    cacheSeedMs: Math.round(cacheSeedMs),
    cacheReadMs,
    cacheClearMs,
    budgets: { maxReadMs, maxClearMs },
  };
  console.log(`[performance-map-cache] ${JSON.stringify(metrics)}`);
  await testInfo.attach("performance-map-cache.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });

  expect(cacheReadMs).toBeLessThan(maxReadMs);
  expect(cacheClearMs).toBeLessThan(maxClearMs);
});
