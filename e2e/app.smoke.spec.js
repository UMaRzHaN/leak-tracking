import { expect, test } from "@playwright/test";
import path from "node:path";

const PHOTO_FIXTURE = path.resolve("public/vema_sa_logo.jpg");

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
    page.getByRole("button", { name: "Добавить утечку", exact: true }),
  ).toBeVisible();
}

async function setUserProfile(page, name = "E2E Inspector") {
  await page.getByTitle("Пользователь").click();
  await page.getByLabel("Имя", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Пользователь", exact: true }),
  ).toHaveCount(0);
}

async function createLeak(page, leakId = "4242") {
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await expect(page.getByText("Новая утечка", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Редактировать параметры" }).click();
  const paramsModal = page.locator('[class*="_modal_"]').last();
  await paramsModal.locator('input[type="number"]').first().fill("1");
  await paramsModal.getByLabel(/^Серийный номер оборудования/).fill(leakId);
  await expect(
    paramsModal.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeEnabled();
  await paramsModal
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Параметры расчёта" }),
  ).toHaveCount(0);

  await page.getByLabel(/^Бирка/).fill(leakId);
  await page.getByLabel(/^Видео/).fill("1042");
  await page.getByLabel(/^Скорость/).fill("1.5");
  await page.getByRole("button", { name: "Далее →" }).click();

  await expect(page.getByText("Шаг 2 /", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Далее →" }).click();

  await expect(page.getByText("Шаг 3 /", { exact: false })).toBeVisible();
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
  await page.getByRole("button", { name: "💾 Сохранить" }).click();

  await expect(
    page.getByRole("heading", { name: "Утечка сохранена" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "На главную" }).click();
  await expect(page.getByText(`№ Б-${leakId}`, { exact: true })).toBeVisible();
}

async function openLeakDetails(page, currentStatus = "Открыта") {
  const card = page.locator("[data-urgency]").first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  if (!box) throw new Error("Leak card is not visible");

  const startX = box.x + 40;
  const y = box.y + Math.min(box.height / 2, 80);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 100, y, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: currentStatus, exact: true }),
  ).toBeVisible();
}

async function chooseDetailsStatus(page, status) {
  await page
    .getByRole("button", {
      name: /^(Открыта|В ремонте|Устранена)$/,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: status, exact: true }).click();
}

async function attachModalPhoto(page) {
  const modalFileInput = page.locator('input[type="file"][accept="image/*"]');
  await modalFileInput.setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
}

async function openDatabase(page) {
  await page.getByRole("contentinfo").getByRole("button").nth(2).click();
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

  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
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

test("creates a leak with a photo and keeps it after reload", async ({
  page,
}) => {
  await createProject(page, "Leak persistence");
  await setUserProfile(page);
  await createLeak(page, "5101");

  await page.reload();

  await expect(
    page.getByText("Leak persistence", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("№ Б-5101", { exact: true })).toBeVisible();
  await expect(page.getByText("1.5 л/мин", { exact: true })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(1);
});

test("moves a leak through repair, resolution, and reopening", async ({
  page,
}) => {
  await createProject(page, "Lifecycle E2E");
  await setUserProfile(page);
  await createLeak(page, "5201");

  await openDatabase(page);
  await openLeakDetails(page);

  await chooseDetailsStatus(page, "В ремонте");
  await expect(
    page.getByRole("heading", { name: "Утечка в ремонте" }),
  ).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText(/^В ремонте$/i).first()).toBeVisible();
  await openLeakDetails(page, "В ремонте");

  await chooseDetailsStatus(page, "Устранена");
  await expect(
    page.getByRole("heading", { name: "Устранение утечки" }),
  ).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText(/^Устранена$/i).first()).toBeVisible();
  await openLeakDetails(page, "Устранена");

  await chooseDetailsStatus(page, "Открыта");
  await expect(
    page.getByRole("heading", { name: "Повторное открытие утечки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Открыть", exact: true }).click();

  await expect(page.getByText(/^Открыта$/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Открыта$/i).first()).toBeVisible();
});

test("restores project data from a ZIP backup after clearing the database", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createProject(page, "Backup restore E2E");
  await setUserProfile(page);
  await createLeak(page, "5301");

  await page.getByTitle("Настройки").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт ZIP" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page
    .getByRole("button", { name: "Очистить базу данных", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Очистить базу данных" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Очистить базу данных", exact: true })
    .last()
    .click();
  await expect(page.getByRole("alert")).toContainText("База данных очищена");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Импорт ZIP" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(backupPath);

  await expect(
    page.getByRole("heading", { name: "Проект уже существует" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Перезаписать" }).click();
  await expect(page.getByRole("alert")).toContainText("Backup restore E2E");
  await expect(page.getByRole("alert")).toContainText("перезаписан");

  await page.getByRole("button", { name: "←" }).click();
  await openDatabase(page);
  await expect(page.getByText("№ Б-5301", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("№ Б-5301", { exact: true })).toBeVisible();
});

test("rejects a corrupted ZIP backup without changing project data", async ({
  page,
}) => {
  await createProject(page, "Corrupted backup E2E");
  await setUserProfile(page);
  await createLeak(page, "5351");

  await page.getByTitle("Настройки").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Импорт ZIP" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "broken-upstream.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("this is not a zip archive"),
  });

  await expect(page.getByRole("alert")).toContainText("Ошибка импорта");

  await page.getByRole("button", { name: "←" }).click();
  await openDatabase(page);
  await expect(page.getByText("№ Б-5351", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("№ Б-5351", { exact: true })).toBeVisible();
});

test("records and completes a monitoring round", async ({ page }) => {
  test.setTimeout(60_000);
  await createProject(page, "Monitoring E2E");
  await setUserProfile(page);
  await createLeak(page, "5401");

  await page.getByRole("button", { name: "Мониторинг", exact: true }).click();
  await page.getByRole("button", { name: "Начать мониторинг" }).click();
  await expect(
    page.getByRole("heading", { name: "Начать мониторинг?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Начать обход" }).click();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Проверить", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Комментарий", { exact: true })
    .fill("Контрольный обход E2E");
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Результат мониторинга сохранен",
  );
  await expect(
    page.getByText("Все теги проверены", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Завершить обход" }).click();
  await expect(page.getByText("Обход завершён", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Мониторинг", exact: true }).click();
  await expect(page.getByText("Обход завершён", { exact: true })).toBeVisible();
  await expect(page.getByText("1/1", { exact: true })).toBeVisible();
});

test("bulk changes selected leaks to repair status", async ({ page }) => {
  test.setTimeout(90_000);
  await createProject(page, "Bulk status E2E");
  await setUserProfile(page);
  await createLeak(page, "5451");
  await createLeak(page, "5452");

  await openDatabase(page);
  await expect(page.getByText("№ Б-5451", { exact: true })).toBeVisible();
  await expect(page.getByText("№ Б-5452", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Выбрать всё" }).click();
  await expect(page.getByText("2 выбрано из 2")).toBeVisible();

  await page.getByRole("button", { name: "⇌ СТАТУС" }).click();
  await page.getByRole("button", { name: "В ремонте", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Утечка в ремонте" }),
  ).toBeVisible();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();

  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await attachModalPhoto(page);
  await page.getByRole("button", { name: "Подтвердить" }).click();

  await expect(page.getByRole("alert")).toContainText("Status changed", {
    timeout: 10_000,
  });
  await expect(page.getByText("2 выбрано из 2")).toHaveCount(0);
  await expect(
    page.locator("[data-urgency]").filter({ hasText: "В ремонте" }),
  ).toHaveCount(2);

  await page.reload();
  await openDatabase(page);
  await expect(
    page.locator("[data-urgency]").filter({ hasText: "В ремонте" }),
  ).toHaveCount(2);
});

test("exports and imports an Excel archive as a project copy", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await createProject(page, "Excel roundtrip");
  await setUserProfile(page);
  await createLeak(page, "5501");

  await openDatabase(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "📥 XLSX" }).click();
  const download = await downloadPromise;
  const excelArchivePath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(excelArchivePath);

  await page.getByTitle("Настройки").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Импорт Excel" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(excelArchivePath);

  await expect(
    page.getByRole("heading", { name: "Проект уже существует" }),
  ).toBeVisible();
  await expect(
    page.getByText("Обновится", { exact: true }).locator(".."),
  ).toContainText("0");
  await expect(
    page.getByText("Пропустится", { exact: true }).locator(".."),
  ).toContainText("1");
  await expect(
    page.getByText("Изменённые поля", { exact: true }).locator(".."),
  ).toContainText("0");
  await page.getByRole("button", { name: "Создать копию" }).click();
  await expect(
    page.getByText("Excel roundtrip (Excel)", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "←" }).click();
  await openDatabase(page);
  await expect(page.getByText("№ Б-5501", { exact: true })).toBeVisible();
});
