import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  createLeak,
  createProject,
  openHome,
  openRound,
  setUserProfile,
} from "./helpers.js";

/**
 * Маршрут обхода из центральной кнопки мониторинга: точки по порядку от
 * текущего места, плашка на карте и переход к проверке — до тех пор, пока
 * проверенная точка не сдвинет маршрут на следующую.
 */
test("ведёт по маршруту и сдвигается после проверки", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["geolocation"]);
  await createProject(page);
  await setUserProfile(page);

  await context.setGeolocation({ latitude: 46.2061, longitude: 53.2875 });
  await createLeak(page, "6102", {
    subdivision: "ПУ 1",
    deposit: "Тенгизское",
    location: "Куст 12",
  });
  await openHome(page);
  await context.setGeolocation({ latitude: 46.2041, longitude: 53.2835 });
  await createLeak(page, "6101", {
    subdivision: "ПУ 1",
    deposit: "Тенгизское",
    location: "Куст 9",
  });

  await openRound(page);
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();
  // В мониторинге утечки не заводят: в центре панели маршрут, а не «+».
  await expect(
    page.getByRole("button", { name: "Добавить утечку" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Построить маршрут" }).click();

  const sheet = page.getByRole("dialog", { name: "Маршрут по точкам" });
  await expect(sheet.getByText("Точек: 2", { exact: false })).toBeVisible();
  // Ближайшая к текущему месту — первой.
  await expect(sheet.getByRole("listitem").nth(1)).toContainText("Куст 9");
  await sheet.getByRole("button", { name: "Начать маршрут" }).click();

  await expect(page.getByText("Маршрут · точка 1 из 2")).toBeVisible();
  await expect(page.getByText("осталось 2")).toBeVisible();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Проверка утечки" }),
  ).toBeVisible();
  await page.getByLabel("Комментарий", { exact: true }).fill("По маршруту");
  await attachModalPhoto(page);
  await page
    .getByRole("button", { name: "Сохранить проверку", exact: true })
    .click();

  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Карта", exact: true })
    .click();
  await expect(page.getByText("Маршрут · точка 2 из 2")).toBeVisible();
  await expect(page.getByText("Тенгизское · Куст 12")).toBeVisible();

  await page.getByRole("button", { name: "Завершить маршрут" }).click();
  await expect(page.getByText(/Маршрут · точка/)).toHaveCount(0);
});
