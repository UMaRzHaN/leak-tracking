import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  chooseDetailsStatus,
  createLeak,
  createProject,
  footerTab,
  openDatabase,
  openLeakDetails,
  openMenuItem,
  setUserProfile,
} from "./helpers.js";

/**
 * Модуль ремонтов от начала работ до приёмки: утечка в ремонте попадает в
 * журнал, бригада отмечает готовность, приёмка со снимком закрывает ремонт.
 */
test("ведёт ремонт от отметки бригады до приёмки", async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, "Repairs E2E");
  await setUserProfile(page);
  await createLeak(page, "7301");

  await openDatabase(page);
  await openLeakDetails(page);
  await chooseDetailsStatus(page, "В ремонте");
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText(/^В ремонте$/i).first()).toBeVisible();

  await openMenuItem(page, /^Ремонтные работы/);
  await expect(page.getByText("№ 7301", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить утечку" }),
  ).toHaveCount(0);

  await footerTab(page, "Обход").click();
  await page.getByRole("button", { name: "Отметить", exact: true }).click();
  await page.getByRole("radio", { name: "Готово к проверке" }).click();
  await page.getByLabel("Бригада", { exact: true }).fill("Бригада 2");
  await page.getByRole("button", { name: "Сохранить отметку" }).click();

  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Приёмка ремонта" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Заказчик" }).click();
  await page.getByLabel("Наименование МТР").fill("Прокладка СНП-Д 200-16");
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Принять и закрыть ремонт" }).click();

  await page.getByRole("button", { name: /^Принято 1/ }).click();
  await expect(page.getByText("№ 7301", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Принято 1/ }).click();
  await expect(page.getByText(/^Принят:/)).toBeVisible();
});
