import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  createLeak,
  createProject,
  footerTab,
  openMenuItem,
  setUserProfile,
  openMapFilters,
} from "./helpers.js";
import { startRepairByCheck } from "./repairSteps.js";

/**
 * Модуль ремонтов от начала работ до приёмки: утечка в ремонте попадает в
 * журнал, проверка ремонта со снимком и бригадой закрывает его.
 */
test("ведёт ремонт от начала работ до устранения", async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, "Repairs E2E");
  await setUserProfile(page);
  await createLeak(page, "7301");

  await startRepairByCheck(page);

  await openMenuItem(page, /^Ремонтные работы/);
  await expect(page.getByText("№ 7301", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить утечку" }),
  ).toHaveCount(0);

  await footerTab(page, "Обход").click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Приёмка ремонта" }),
  ).toBeVisible();
  await page.getByLabel("Бригада", { exact: true }).fill("Бригада 2");
  await page.getByRole("radio", { name: "Заказчик" }).click();
  await page.getByLabel("Наименование МТР").fill("Прокладка СНП-Д 200-16");
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Принять и закрыть ремонт" }).click();

  // Первая проверка начала обход — закрытый ремонт в нём проверен.
  await page.getByRole("button", { name: /^Проверено 1/ }).click();
  await expect(page.getByText("№ 7301", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Проверено 1/ }).click();
  await expect(page.getByText(/^Устранена:/)).toBeVisible();

  // Карта модуля ремонтов делит ремонты по стадии — в шторке фильтров.
  await footerTab(page, "Карта").click();
  await openMapFilters(page);
  await page.getByRole("button", { name: "Фильтр по стадии" }).click();
  await expect(
    page.getByRole("button", { name: /^Устранена\s*1$/ }),
  ).toBeVisible();
});

test("принимает оборудование партиями и даёт его в МТР ремонта", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProject(page, "Acceptance E2E");
  await setUserProfile(page);
  await createLeak(page, "7401");
  await startRepairByCheck(page);

  await openMenuItem(page, /^Ремонтные работы/);
  await page.getByRole("button", { name: "Приёмка оборудования" }).click();
  await page.getByRole("button", { name: "Новая приёмка" }).click();
  await page.getByLabel("Накладная", { exact: true }).fill("М-11 № 4471");

  await page.getByRole("button", { name: /Добавить позицию/ }).click();
  const item = page.getByRole("dialog", { name: "Добавить позицию" });
  await item.getByLabel("Наименование").fill("Прокладка СНП-Д 200-16");
  await item.getByLabel("Пришло").fill("2");
  await item.getByLabel("Заказано").fill("4");
  await expect(item.getByText(/Остаётся 2 шт/)).toBeVisible();
  await item.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить и отправить" }).click();

  // Пришла половина — накладная в «Частично» и ждёт следующей партии.
  await expect(
    page.getByRole("button", { name: /^Частично 1/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Остаток 2")).toBeVisible();
  await page.getByRole("button", { name: "Принять партию" }).click();
  await page.getByRole("button", { name: "Сохранить и отправить" }).click();
  await expect(page.getByText("Все партии приняты")).toBeVisible();

  await page.getByRole("button", { name: "Назад" }).click();
  await footerTab(page, "Обход").click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();

  // МТР по умолчанию — из принятого по накладной.
  await expect(page.getByRole("radio", { name: "Приёмка" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByLabel("Позиция из накладной")).toContainText(
    "Прокладка СНП-Д 200-16",
  );
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Принять и закрыть ремонт" }).click();
  await page.getByRole("button", { name: /^Проверено 1/ }).click();
  await expect(page.getByText("№ 7401", { exact: true })).toBeVisible();
});
