import { expect, test } from "@playwright/test";
import { createProject, footerTab, openHome } from "./helpers.js";

/**
 * «Обследовано без утечек» (4a–4b): введённая категория с оценкой «всего»
 * даёт охват на экране охвата и в строке на главной LDAR.
 */
test("отмечает обследование и показывает охват", async ({ page }) => {
  await createProject(page, "Coverage E2E");

  await footerTab(page, "Охват").click();
  await expect(
    page.getByRole("heading", { name: "Охват обследования" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отметить обследование" }).click();

  await page.getByLabel("Добавить категорию").fill("ШГРП");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel("Всего в группе «ШГРП»").fill("120");
  await page.getByLabel("Проверено в группе «ШГРП»").fill("47");
  await page.getByRole("button", { name: "Больше" }).click();
  await expect(page.getByText("объектов: 48")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить обследование" }).click();

  await expect(page.getByText("48 из ~120 объектов")).toBeVisible();
  await expect(page.getByText("40%", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Назад" }).click();
  await openHome(page);
  await expect(page.getByText("48 из ~120 · 40%")).toBeVisible();

  // Переживает перезагрузку: ввод хранится в проекте.
  await page.reload();
  await expect(page.getByText("48 из ~120 · 40%")).toBeVisible();
});
