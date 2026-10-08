import { test, expect } from "@playwright/test";
import {
  createLeak,
  createProject,
  openDatabase,
  openLeakDetails,
  openMap,
  openMenuItem,
  setUserProfile,
} from "./helpers";
import {
  confirmNewRepairRound,
  swipeCardLeft as swipeLeft,
} from "./repairSteps.js";

test("в ремонтах свайп открывает проверку ремонта и двигает стадию", async ({
  page,
}, testInfo) => {
  await createProject(page, "Repair check E2E");
  await setUserProfile(page);
  await createLeak(page, "1038");

  await openMenuItem(page, /^Ремонтные работы/);
  await openDatabase(page);
  await swipeLeft(page);
  await confirmNewRepairRound(page);

  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("№ 1038")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("repair-check.png"),
    fullPage: false,
  });

  // Утечка есть, ремонт выполнен — «в ремонте».
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await expect(
    sheet.getByText("Утечка останется «В ремонте»", { exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Оставить в ремонте" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "Ремонт оставлен в работе" }),
  ).toBeVisible();

  // Ремонт не выполнен — назад в «Ожидает МТР», то есть «Открыта».
  await swipeLeft(page);
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await sheet.getByLabel("Ремонт выполнен?").selectOption("no");
  await sheet.getByRole("button", { name: "Вернуть: ожидает МТР" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ожидает МТР" }),
  ).toBeVisible();

  // Всё это видно в карточке, на вкладке «Ремонты».
  await openLeakDetails(page, "Открыта");
  await page.getByRole("button", { name: "Ремонты", exact: true }).click();
  // Возврат и отметка «ожидает МТР» — одно действие, одна строка.
  const log = page.locator("[data-event]");
  await expect(log).toHaveCount(3);
  await expect(log.nth(0)).toContainText("Ожидает МТР");
  await expect(log.nth(1)).toContainText("В ремонте");
  await expect(log.nth(2)).toContainText("Начат ремонт");
  await page.screenshot({ path: testInfo.outputPath("repair-log.png") });
});

test("на карте ремонтов «Проверить» открывает проверку ремонта", async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: 41.311081, longitude: 69.240562 });
  await createProject(page, "Repair map E2E");
  await setUserProfile(page);
  await createLeak(page, "2042");

  await openMenuItem(page, /^Ремонтные работы/);
  await openMap(page);
  await page.locator(".leaflet-marker-icon", { hasText: "2042" }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await confirmNewRepairRound(page);

  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("№ 2042")).toBeVisible();
});

test("в ремонтах «Проверить» у выбранных проверяет их по очереди", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProject(page, "Repair queue E2E");
  await setUserProfile(page);
  await createLeak(page, "3101");
  await createLeak(page, "3102");

  await openMenuItem(page, /^Ремонтные работы/);
  await openDatabase(page);
  await page.getByRole("button", { name: "Выбрать всё" }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await confirmNewRepairRound(page);

  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await expect(sheet).toContainText("1 из 2");
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await sheet.getByRole("button", { name: "Оставить в ремонте" }).click();

  await expect(sheet).toContainText("2 из 2");
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await sheet.getByRole("button", { name: "Оставить в ремонте" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("В ремонте", { exact: true })).toHaveCount(2);
});
