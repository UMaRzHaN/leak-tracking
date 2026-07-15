import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";

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
    bulkSaveMs: Number(
      process.env.PERF_MAX_BULK_SAVE_MS ?? (largeDataset ? 15_000 : 8_000),
    ),
    excelExportMs: Number(
      process.env.PERF_MAX_EXCEL_EXPORT_MS ?? (largeDataset ? 60_000 : 30_000),
    ),
    excelImportMs: Number(
      process.env.PERF_MAX_EXCEL_IMPORT_MS ?? (largeDataset ? 60_000 : 30_000),
    ),
  };
}

async function countPersistedStatuses(page, projectId) {
  return page.evaluate(async (id) => {
    const leaks = await new Promise((resolve, reject) => {
      const request = indexedDB.open("LeakTrackingDataDB", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("projects", "readonly");
        const getRequest = transaction.objectStore("projects").get(id);
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result?.data ?? []);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    });

    return leaks.reduce((counts, leak) => {
      counts[leak.status] = (counts[leak.status] ?? 0) + 1;
      return counts;
    }, {});
  }, projectId);
}

async function seedProject(page, recordCount) {
  return page.evaluate(async (count) => {
    const startedAt = performance.now();
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
        photo: null,
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

    return performance.now() - startedAt;
  }, recordCount);
}

for (const recordCount of readRecordCounts()) {
  test(`loads, updates, and round-trips ${recordCount.toLocaleString("en-US")} records`, async ({
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
    const searchStartedAt = Date.now();
    await page
      .getByPlaceholder("Search by ID, object, description...")
      .fill(targetTag);
    await expect(renderedCards).toHaveCount(1);
    await expect(renderedCards.first()).toContainText(targetTag);
    const searchMs = Date.now() - searchStartedAt;

    const searchInput = page.getByPlaceholder(
      "Search by ID, object, description...",
    );
    await searchInput.fill("");
    await expect(
      page.getByText(`${recordCount} records`, { exact: false }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(
      page.getByText(`${recordCount} selected of ${recordCount}`, {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /STATUS$/ }).click();

    const bulkSaveStartedAt = Date.now();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(
      page.getByText(`${recordCount} selected of ${recordCount}`, {
        exact: true,
      }),
    ).toHaveCount(0, { timeout: budgets.bulkSaveMs + 5_000 });
    const bulkSaveMs = Date.now() - bulkSaveStartedAt;
    const persistedStatuses = await countPersistedStatuses(
      page,
      `perf-${recordCount}`,
    );
    expect(persistedStatuses).toEqual({ open: recordCount });

    const downloadPromise = page.waitForEvent("download", {
      timeout: budgets.excelExportMs + 5_000,
    });
    const excelExportStartedAt = Date.now();
    await page.getByRole("button", { name: /XLSX$/ }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Excel export did not produce a file");
    const excelExportMs = Date.now() - excelExportStartedAt;
    const archiveBytes = (await stat(downloadPath)).size;
    expect(archiveBytes).toBeGreaterThan(0);

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

    const browserStats = await page.evaluate(() => ({
      domNodes: document.getElementsByTagName("*").length,
      usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    }));
    const metrics = {
      recordCount,
      seedMs: Math.round(seedMs),
      coldStartMs,
      databaseOpenMs,
      searchMs,
      bulkSaveMs,
      excelExportMs,
      excelImportMs,
      archiveBytes,
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
    expect(bulkSaveMs).toBeLessThan(budgets.bulkSaveMs);
    expect(excelExportMs).toBeLessThan(budgets.excelExportMs);
    expect(excelImportMs).toBeLessThan(budgets.excelImportMs);
  });
}
