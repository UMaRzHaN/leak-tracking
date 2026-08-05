import { expect, test } from "@playwright/test";
import {
  createLeak,
  createProject,
  openDatabase,
  openHome,
  setUserProfile,
} from "./helpers.js";

// The point of the folder view is that picking a place replaces filter
// juggling, so what these check is the selection actually narrowing the
// database and surviving a reload — not just the sheet rendering.

const NORTH_WELL_1 = {
  subdivision: "Северное УПГ",
  deposit: "Мессояхское",
  location: "скважина 1",
};
const NORTH_WELL_2 = { ...NORTH_WELL_1, location: "скважина 2" };
const SOUTH = {
  subdivision: "Южное УПГ",
  deposit: "Ямбургское",
  location: "скважина 9",
};

async function seedProject(page) {
  await createProject(page, "Location scope E2E");
  await setUserProfile(page);
  await createLeak(page, "7001", NORTH_WELL_1);
  await openHome(page);
  await createLeak(page, "7002", NORTH_WELL_2);
  await openHome(page);
  await createLeak(page, "7003", SOUTH);
}

async function openLocationBrowser(page) {
  await page
    .getByRole("button", { name: /Все|Северное|Южное/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Выбор объекта" }),
  ).toBeVisible();
}

test("opens the database on the chosen location from any screen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedProject(page);

  // Deliberately not on the database screen: picking a folder should take the
  // user to the records inside it, the way opening a folder does.
  await openHome(page);
  await openLocationBrowser(page);
  await page
    .getByRole("dialog", { name: "Выбор объекта" })
    .getByRole("button", { name: /Южное УПГ\s*1/ })
    .click();

  await expect(page.getByText("Бирка № 7003", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7001", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 запись")).toBeVisible();
});

test("narrows the database to a chosen location and back", async ({ page }) => {
  test.setTimeout(120_000);
  await seedProject(page);

  await openDatabase(page);
  await expect(page.getByText("Бирка № 7001", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7003", { exact: true })).toBeVisible();

  await openLocationBrowser(page);
  const dialog = page.getByRole("dialog", { name: "Выбор объекта" });
  // Counts make the folder useful before it is opened.
  await expect(
    dialog.getByRole("button", { name: /Северное УПГ\s*2/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /Северное УПГ\s*2/ }).click();

  await expect(page.getByText("Бирка № 7001", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7002", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7003", { exact: true })).toHaveCount(0);

  // The selection is part of the project's saved filters, so it has to outlive
  // a reload — that is what makes it a place you are in rather than a gesture.
  await page.reload();
  await openDatabase(page);
  await expect(page.getByText("Бирка № 7003", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Сбросить выбор объекта" }).click();
  await expect(page.getByText("Бирка № 7003", { exact: true })).toBeVisible();
});

test("drills to the third level without leaving the sheet", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedProject(page);
  await openDatabase(page);

  await openLocationBrowser(page);
  const dialog = page.getByRole("dialog", { name: "Выбор объекта" });

  await dialog.getByRole("button", { name: "Открыть «Северное УПГ»" }).click();
  await dialog.getByRole("button", { name: "Открыть «Мессояхское»" }).click();
  // Third level: the individual wells.
  await dialog.getByRole("button", { name: /скважина 2\s*1/ }).click();

  await expect(page.getByText("Бирка № 7002", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7001", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Бирка № 7003", { exact: true })).toHaveCount(0);
});
