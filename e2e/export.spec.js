import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  createLeak,
  createProject,
  footerTab,
  openMenuItem,
  setUserProfile,
} from "./helpers.js";

/**
 * Экспорт из меню (8a → 8b): период и итог видны до выгрузки, после неё —
 * «Файл сформирован» и запись в истории.
 */
test("выгружает отчёт с экрана экспорта", async ({ page }) => {
  await createProject(page, "Export E2E");
  await setUserProfile(page);
  await createLeak(page, "8101");

  await openMenuItem(page, "Экспорт отчёта");
  await expect(
    page.getByRole("heading", { name: "Экспорт отчёта" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(page.getByText(/^Записей: 1 · фото: \d+$/)).toBeVisible();

  // Разделы включаются чипами (8a), фото — у каждого листа своё.
  const repairsChip = page.getByRole("button", { name: /^Ремонты/ });
  await repairsChip.click();
  await expect(repairsChip).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Лист «Ремонты»")).toHaveCount(0);
  // «История» в файле всегда — выключить её нечем.
  await expect(page.getByText("Лист «История»")).toBeVisible();
  const leakPhotos = page.getByRole("button", {
    name: "Фото: Лист «Утечки»",
  });
  await leakPhotos.click();
  await expect(page.getByText("Записей: 1 · фото: 0")).toBeVisible();

  // Выбор запоминается: после перезагрузки всё как было.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Ремонты/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Фото: Лист «Утечки»" }),
  ).toHaveAttribute("aria-pressed", "false");

  // Файл сначала собирается (8b), а сохранить его или отправить решают на
  // экране готового файла.
  await page.getByRole("button", { name: "Сформировать файл" }).click();
  await expect(page.getByText("Файл сформирован")).toBeVisible();
  await expect(page.getByText(/^\d+ сек$/)).toBeVisible();
  await expect(page.getByText(/«Утечки» в файл не вошли/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить в «Файлы»" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  await expect(page.getByText("Последние выгрузки")).toBeVisible();
  await expect(page.getByText(/сохранено локально/)).toBeVisible();
});

// Ремонты и приёмка оборудования доходят до книги своими листами: журнал
// ремонтов с бригадой и приёмка с партиями накладной.
test("кладёт в книгу журнал ремонтов и приёмку оборудования", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await createProject(page, "Export repairs E2E");
  await setUserProfile(page);
  await createLeak(page, "8201");

  await openMenuItem(page, /^Ремонтные работы/);
  await page.getByRole("button", { name: "Приёмка оборудования" }).click();
  await page.getByRole("button", { name: "Новая приёмка" }).click();
  await page.getByLabel("Накладная", { exact: true }).fill("М-11 № 4471");
  await page.getByRole("button", { name: /Добавить позицию/ }).click();
  const item = page.getByRole("dialog", { name: "Добавить позицию" });
  await item.getByLabel("Наименование").fill("Прокладка СНП-Д 200-16");
  await item.getByLabel("Пришло").fill("2");
  await item.getByLabel("Заказано").fill("4");
  await item.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить и отправить" }).click();
  await page.getByRole("button", { name: "Назад" }).click();

  await footerTab(page, "Обход").click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await sheet.getByLabel("Бригада", { exact: true }).fill("Бригада 2");
  await sheet.getByRole("button", { name: "Оставить в ремонте" }).click();
  await expect(sheet).toHaveCount(0);

  await openMenuItem(page, "Экспорт отчёта");
  await expect(page.getByText("Лист «Журнал ремонтов»")).toBeVisible();
  await expect(page.getByText("Лист «Приёмка оборудования»")).toBeVisible();
  await page.getByRole("button", { name: "Сформировать файл" }).click();
  await expect(page.getByText("Файл сформирован")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить в «Файлы»" }).click();
  const zipPath = testInfo.outputPath("report.zip");
  await (await downloadPromise).saveAs(zipPath);

  const { default: JSZip } = await import("jszip");
  const { default: ExcelJS } = await import("exceljs");
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const xlsxName = Object.keys(zip.files).find((name) =>
    name.endsWith(".xlsx"),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await zip.file(xlsxName).async("nodebuffer"));

  const log = workbook.getWorksheet("Журнал ремонтов");
  const logText = JSON.stringify(log.getSheetValues());
  expect(logText).toContain("Бригада 2");
  expect(logText).toContain("В ремонте");

  const acceptance = workbook.getWorksheet("Приёмка оборудования");
  const acceptanceText = JSON.stringify(acceptance.getSheetValues());
  expect(acceptanceText).toContain("М-11 № 4471");
  expect(acceptanceText).toContain("Прокладка СНП-Д 200-16");
  expect(acceptanceText).toContain("Частично");
});
