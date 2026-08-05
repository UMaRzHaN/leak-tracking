import { expect, test } from "@playwright/test";
import {
  attachModalPhoto,
  chooseDetailsStatus,
  createLeak,
  createProject,
  exportExcelArchive,
  importExcelArchive,
  leaveSettings,
  openDatabase,
  openHome,
  openLeakDetails,
  setUserProfile,
} from "./helpers.js";

// app.smoke.spec.js covers the "create a copy" branch of the import conflict.
// The other two branches decide what happens to data that already exists, so
// they are the ones where a regression loses field work rather than duplicating
// it. Both cases are built so the expected outcome does not depend on merge
// timestamps: the archive is exported first, the divergence is created after.

test("overwriting an Excel import restores the state held in the archive", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await createProject(page, "Excel overwrite");
  await setUserProfile(page);
  await createLeak(page, "5601");

  await openDatabase(page);
  const archivePath = await exportExcelArchive(page, testInfo);

  // Diverge from the archive: the leak goes into repair after the export.
  await openLeakDetails(page);
  await chooseDetailsStatus(page, "В ремонте");
  await expect(
    page.getByRole("heading", { name: "Утечка в ремонте" }),
  ).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText(/^В ремонте$/i).first()).toBeVisible();

  await importExcelArchive(page, archivePath);
  await page.getByRole("button", { name: "Перезаписать" }).click();
  await expect(page.getByText(/Проект перезаписан из Excel/)).toBeVisible();

  // Overwrite has to ignore the newer local edit, which is what separates it
  // from merge — otherwise the two branches would be indistinguishable here.
  await leaveSettings(page);
  await openDatabase(page);
  await expect(page.getByText("Бирка № 5601", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Открыта$/i).first()).toBeVisible();
  await expect(page.getByText(/^В ремонте$/i)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/^Открыта$/i).first()).toBeVisible();
});

test("merging an Excel import keeps a leak the archive does not contain", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await createProject(page, "Excel merge");
  await setUserProfile(page);
  await createLeak(page, "5701");

  await openDatabase(page);
  const archivePath = await exportExcelArchive(page, testInfo);

  // Recorded after the export, so it exists only locally.
  await openHome(page);
  await createLeak(page, "5702");

  await importExcelArchive(page, archivePath);
  await expect(
    page.getByText("Добавится", { exact: true }).locator(".."),
  ).toContainText("0");
  await expect(
    page.getByText("Пропустится", { exact: true }).locator(".."),
  ).toContainText("1");
  await page.getByRole("button", { name: "Объединить" }).click();
  await expect(page.getByText(/Excel объединён с проектом/)).toBeVisible();

  // A merge that dropped local-only records would still satisfy the counters
  // above, so the assertion that matters is that both leaks survive a reload.
  await leaveSettings(page);
  await openDatabase(page);
  await expect(page.getByText("Бирка № 5701", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 5702", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Бирка № 5701", { exact: true })).toBeVisible();
  await expect(page.getByText("Бирка № 5702", { exact: true })).toBeVisible();
});
