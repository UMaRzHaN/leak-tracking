import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  chooseDetailsStatus,
  createLeak,
  createProject,
  openDatabase,
  openHome,
  openLeakDetails,
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

test("summarises only the chosen location on the main page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedProject(page);

  await openHome(page);
  await expect(page.getByText("Последние", { exact: false })).toBeVisible();
  await expect(page.getByText("Бирка № 7003", { exact: true })).toBeVisible();

  await openLocationBrowser(page);
  await page
    .getByRole("dialog", { name: "Выбор объекта" })
    .getByRole("button", { name: /Северное УПГ\s*2/ })
    .click();
  await openHome(page);

  // The summary, the recent list and the footer badge all describe the same
  // set now, so a disagreement between them is the regression to catch.
  const total = page.locator("text=ВСЕГО").locator("..");
  await expect(total).toContainText("2");
  await expect(page.getByText("Бирка № 7001", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 7003", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("contentinfo").getByRole("button").nth(2),
  ).toContainText("2");
});

test("keeps leaks outside the location when one inside it is edited", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedProject(page);

  await openLocationBrowser(page);
  await page
    .getByRole("dialog", { name: "Выбор объекта" })
    .getByRole("button", { name: /Северное УПГ\s*2/ })
    .click();

  // Saving while a folder is selected must not persist the scoped list: that
  // would delete every record outside it, and only a later reload would show
  // the loss.
  await openLeakDetails(page);
  await chooseDetailsStatus(page, "В ремонте");
  await expect(
    page.getByRole("heading", { name: "Утечка в ремонте" }),
  ).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText(/^В ремонте$/i).first()).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Сбросить выбор объекта" }).click();
  await openDatabase(page);
  await expect(page.getByText("Бирка № 7003", { exact: true })).toBeVisible();
  await expect(page.getByText("3 записи")).toBeVisible();
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
