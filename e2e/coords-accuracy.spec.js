import { expect, test } from "@playwright/test";
import {
  createLeak,
  createProject,
  openLeakDetails,
  setUserProfile,
} from "./helpers";

/**
 * Радиус приёмника доезжает от браузера до карточки — и уходит, когда
 * координату поправили руками.
 *
 * Проверка сквозная не для полноты, а потому что правило живёт на стыке:
 * точность приходит от geolocation, сохраняется вместе с координатой и должна
 * исчезнуть при её ручной правке. Ни один из трёх кусков по отдельности этого
 * не показывает, а цена ошибки — точка, выглядящая на карте достовернее, чем
 * она есть.
 */
test("точность координат сохраняется и снимается при ручной правке", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.setGeolocation({
    latitude: 41.311081,
    longitude: 69.240562,
    accuracy: 12.4,
  });

  await createProject(page);
  await setUserProfile(page);
  await createLeak(page, "4242");

  await page.waitForTimeout(800);
  await openLeakDetails(page);
  await page.getByRole("button", { name: "Координаты", exact: true }).click();
  // Приёмник сообщил 12,4 м — доли метра он не знает, и карточка их не обещает.
  await expect(page.getByText("±12 м")).toBeVisible();

  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByLabel("Широта (X)", { exact: true }).fill("41.400000");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForTimeout(1200);

  await openLeakDetails(page);
  await page.getByRole("button", { name: "Координаты", exact: true }).click();
  await expect(page.getByText("41.400000")).toBeVisible();
  await expect(page.getByText(/Точность координат/)).toHaveCount(0);
});
