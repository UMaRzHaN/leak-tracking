import { expect, test } from "@playwright/test";

async function createProject(page, name = "E2E Upstream") {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Журнал утечек", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Название проекта", { exact: true }).fill(name);
  await page.getByRole("button", { name: /Upstream/ }).click();
  await page.getByRole("button", { name: "Начать работу" }).click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить утечку" }),
  ).toBeVisible();
}

test("creates a project and restores it after reload", async ({ page }) => {
  await createProject(page);

  await page.reload();

  await expect(page.getByText("E2E Upstream", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Журнал утечек", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Добавить утечку" }),
  ).toBeVisible();
});

test("opens the main application sections", async ({ page }) => {
  await createProject(page, "Navigation smoke");

  await page.getByRole("button", { name: "Добавить утечку" }).click();
  await expect(page.getByText("Новая утечка", { exact: true })).toBeVisible();
  await expect(page.getByText("Шаг 1 /", { exact: false })).toBeVisible();

  await page.goto("/");
  const databaseButton = page.getByRole("button", {
    name: "База",
    exact: true,
  });
  await databaseButton.click();
  await expect(databaseButton).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Записей нет", { exact: true })).toBeVisible();

  const monitoringButton = page.getByRole("button", {
    name: "Мониторинг",
    exact: true,
  });
  await monitoringButton.click();
  await expect(monitoringButton).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText(
      "Активного обхода нет. Начните мониторинг, чтобы сформировать список к проверке.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать мониторинг" }),
  ).toBeVisible();
});
