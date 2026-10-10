import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  createLeak,
  createProject,
  openRound,
  setUserProfile,
  openSettings,
  leaveSettings,
  openMap,
} from "./helpers.js";

/**
 * «Новый обход» нажали по ошибке: обход № 2 сливается обратно в № 1, и
 * проверенное в № 1 снова считается проверенным. Меню при этом показывает,
 * сколько тегов осталось.
 */
test("сливает ошибочно начатый обход с предыдущим", async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, "Round Merge");
  await setUserProfile(page);
  await createLeak(page, "9101");
  await createLeak(page, "9102");

  await openRound(page);
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();
  await page
    .getByRole("button", { name: "Проверить", exact: true })
    .first()
    .click();
  await page.getByLabel("Комментарий", { exact: true }).fill("Обход");
  await attachModalPhoto(page);
  await page
    .getByRole("button", { name: "Сохранить проверку", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "К проверке 1" }),
  ).toBeVisible();

  // По ошибке — новый обход: к проверке снова оба.
  await page.getByRole("button", { name: "Новый обход" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();
  await expect(
    page.getByRole("button", { name: "К проверке 2" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Объединить с № 1" }).click();
  await page.getByRole("button", { name: "Объединить", exact: true }).click();
  await expect(page.getByText(/^Обход № 1/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "К проверке 1" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("1 к проверке"),
  ).toBeVisible();
});

test("не даёт начать новый обход, если это выключено в настройках", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProject(page, "Rounds Locked");
  await setUserProfile(page);
  await createLeak(page, "9201");

  await openRound(page);
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();
  await expect(page.getByRole("button", { name: "Новый обход" })).toBeVisible();

  await openSettings(page);
  const allowRounds = page.getByRole("switch", {
    name: "Новые обходы",
    exact: true,
  });
  await expect(allowRounds).toHaveAttribute("aria-checked", "true");
  await allowRounds.click();
  await expect(allowRounds).toHaveAttribute("aria-checked", "false");
  await leaveSettings(page);

  // Обход идёт дальше, но начать следующий нечем.
  await openRound(page);
  await expect(page.getByText(/^Обход № 1/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Новый обход" })).toHaveCount(
    0,
  );
});

test("крестик проверки возвращает на экран, откуда её открыли", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProject(page, "Check Return");
  await setUserProfile(page);
  await createLeak(page, "9301");
  await openRound(page);
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();

  // С карты: булавка → «Проверить» → крестик — снова карта.
  await openMap(page);
  await page.locator(".leaflet-marker-icon", { hasText: "9301" }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Проверка утечки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).first().click();
  const mapTab = page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Карта" });
  await expect(mapTab).toHaveAttribute("aria-current", "page");

  // После сохранения — тоже назад на карту, с итогом проверки.
  await page.locator(".leaflet-marker-icon", { hasText: "9301" }).click();
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByLabel("Комментарий", { exact: true }).fill("С карты");
  await attachModalPhoto(page);
  await page
    .getByRole("button", { name: "Сохранить проверку", exact: true })
    .click();
  await expect(mapTab).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("alert")).toContainText(
    "Результат мониторинга сохранен",
  );
});
