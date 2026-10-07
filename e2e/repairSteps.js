import { expect } from "@playwright/test";
import { openDatabase, openMenuItem } from "./helpers.js";

// Свайп влево по первой карточке: в мониторинге — осмотр, в ремонтах —
// проверка ремонта (7c). Без проверки свайп ничего не делает.
export async function swipeCardLeft(page) {
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

// Ремонт начинается проверкой ремонта: ручного выбора статуса больше нет.
// «Утечка есть, ремонт выполнен» оставляет её «В ремонте».
export async function startRepairByCheck(page) {
  await openMenuItem(page, /^Ремонтные работы/);
  await openDatabase(page);
  await swipeCardLeft(page);
  const sheet = page.getByRole("dialog", { name: "Приёмка ремонта" });
  await sheet.getByLabel("Утечка есть?").selectOption("yes");
  await sheet.getByRole("button", { name: "Оставить в ремонте" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(/^В ремонте$/i).first()).toBeVisible();
}
