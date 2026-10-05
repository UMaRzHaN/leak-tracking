import { expect, test } from "@playwright/test";
import {
  createLeak,
  createProject,
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
  await page.getByRole("button", { name: "Смена", exact: true }).click();
  await expect(page.getByText(/^Записей: 1 · фото: \d+$/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сформировать файл" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  await expect(page.getByText("Файл сформирован")).toBeVisible();
  await expect(page.getByText("Последние выгрузки")).toBeVisible();
});
