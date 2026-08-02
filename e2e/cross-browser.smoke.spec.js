import { expect, test } from "@playwright/test";

test("boots the project setup screen and accepts basic input", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Журнал утечек", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Название проекта", { exact: true })
    .fill("Browser smoke");
  await page.getByRole("button", { name: /Upstream/ }).click();
  await expect(
    page.getByRole("button", { name: "Начать работу" }),
  ).toBeEnabled();
});
