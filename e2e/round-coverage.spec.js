import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  createLeak,
  createProject,
  openMap,
  setUserProfile,
} from "./helpers";

/**
 * Покрытие обхода доезжает до карты.
 *
 * Признак «осмотрено в текущем обходе» рождается в отборе, живёт на записи и
 * читается булавкой. По отдельности эти три куска ничего не показывают, а
 * вопрос у обходчика один: где ещё не были.
 */
test("осмотренная в обходе булавка гаснет, непройденная — нет", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await createProject(page);
  await setUserProfile(page);

  await context.setGeolocation({ latitude: 41.311081, longitude: 69.240562 });
  await createLeak(page, "4242");
  // Вторая в стороне, иначе булавки лягут одна на другую.
  await context.setGeolocation({ latitude: 41.3125, longitude: 69.2425 });
  await createLeak(page, "4243");

  await page.getByRole("button", { name: "Мониторинг", exact: true }).click();
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await page.getByRole("button", { name: "Начать обход" }).click();

  // Проверяем одну из двух.
  await page
    .getByRole("button", { name: "Проверить", exact: true })
    .first()
    .click();
  await page.getByLabel("Комментарий", { exact: true }).fill("Обход");
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Результат мониторинга сохранен",
  );

  await openMap(page);
  await page.getByRole("button", { name: "Фильтр по мониторингу" }).click();
  await page.getByRole("button", { name: "Все теги", exact: true }).click();

  // Под отбором «все» на карте обе точки, и различает их только вид.
  const dimmed = page.locator('.leaflet-marker-icon div[style*="opacity:0.6"]');
  const solid = page.locator(
    '.leaflet-marker-icon div[style*="background:transparent"]',
  );
  await expect(dimmed).toHaveCount(1);
  await expect(solid).toHaveCount(1);
});
