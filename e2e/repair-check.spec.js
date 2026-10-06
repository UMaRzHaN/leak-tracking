import { test, expect } from "@playwright/test";
import {
  createLeak,
  createProject,
  openDatabase,
  openMap,
  openMenuItem,
  setUserProfile,
} from "./helpers";

// Свайп влево по карточке в модуле ремонтов — проверка ремонта (7c), а не
// мониторинг. Ответы решают, куда уходит запись.
async function swipeLeft(page) {
  const card = page.locator("[data-urgency]").first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  if (!box) throw new Error("Leak card is not visible");
  const startX = box.x + box.width - 40;
  const y = box.y + Math.min(box.height / 2, 40);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 120, y, { steps: 6 });
  await page.mouse.up();
}

test("в ремонтах свайп открывает проверку ремонта и двигает стадию", async ({
  page,
}, testInfo) => {
  await createProject(page, "Repair check E2E");
  await setUserProfile(page);
  await createLeak(page, "1038");

  await openMenuItem(page, /^Ремонтные работы/);
  await openDatabase(page);
  await swipeLeft(page);

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

  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("№ 2042")).toBeVisible();
});
