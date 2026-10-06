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
