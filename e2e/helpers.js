import { expect } from "@playwright/test";
import path from "node:path";

// Shared by app.smoke.spec.js and excel-conflict.spec.js. Kept in one place so
// a UI change that breaks the walkthrough is fixed once rather than per spec.
export const PHOTO_FIXTURE = path.resolve("public/vema_sa_logo.jpg");

export async function createProject(page, name = "E2E Upstream") {
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

export async function setUserProfile(page, name = "E2E Inspector") {
  await page.getByTitle("Пользователь").click();
  await page.getByLabel("Имя", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Пользователь", exact: true }),
  ).toHaveCount(0);
}

/**
 * Обязательное на первом шаге утечки: параметры расчёта, бирка, видео,
 * скорость. Без них форма не пускает дальше, поэтому это нужно любому
 * сценарию, который доходит до второго шага.
 */
export async function fillLeakStepOne(page, leakId = "4242") {
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
}

export async function createLeak(page, leakId = "4242", location = null) {
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await expect(page.getByText("Новая утечка", { exact: true })).toBeVisible();

  await fillLeakStepOne(page, leakId);

  // The three location levels live on this first step, so a leak can be filed
  // straight into a place in the hierarchy.
  if (location) {
    await page.getByLabel(/^Подразделение/).fill(location.subdivision);
    await page.getByLabel(/^Месторождение/).fill(location.deposit);
    await page.getByLabel(/^Локация/).fill(location.location);
    // Уход фокуса — то же, что делает человек, переходя к следующему полю.
    // Пока список подсказок открыт, он перекрывает кнопку «Далее».
    // (Escape тоже закрывает его — это проверено в Autocomplete.test.jsx.)
    await page.getByLabel(/^Локация/).blur();
  }

  await page.getByRole("button", { name: /^Далее/ }).click();

  await expect(page.getByText("Шаг 2 /", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /^Далее/ }).click();

  await expect(page.getByText("Шаг 3 /", { exact: false })).toBeVisible();
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
  await page.getByRole("button", { name: /Сохранить$/ }).click();

  await expect(
    page.getByRole("heading", { name: "Утечка сохранена" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "На главную" }).click();
  await expect(page.getByText(`№ ${leakId}`, { exact: true })).toBeVisible();
}

export async function openLeakDetails(page, currentStatus = "Открыта") {
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

export async function chooseDetailsStatus(page, status) {
  await page
    .getByRole("button", {
      name: /^(Открыта|В ремонте|Устранена)$/,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: status, exact: true }).click();
}

export async function attachModalPhoto(page) {
  const modalFileInput = page.locator('input[type="file"][accept="image/*"]');
  await modalFileInput.setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
}

// Каждая вкладка подписана aria-label, поэтому выбирается по имени, а не по
// номеру: у проекта с реестром вкладок шесть, без него — пять, и нумерация
// уезжает от одного лишь типа проекта.
export function footerTab(page, name) {
  return page
    .getByRole("contentinfo")
    .getByRole("button", { name, exact: true });
}

export async function openDatabase(page) {
  await footerTab(page, "База").click();
}

export async function openMap(page) {
  const map = footerTab(page, "Карта");
  await map.click();
  await expect(map).toHaveAttribute("aria-current", "page");
}

export async function openComponentRegistry(page) {
  const registry = footerTab(page, "Реестр");
  await registry.click();
  await expect(
    page.getByRole("heading", { name: "Реестр компонентов" }),
  ).toBeVisible();
}

export async function openHome(page) {
  await footerTab(page, "Главная").click();
  await expect(
    page.getByRole("button", { name: "Добавить утечку", exact: true }),
  ).toBeVisible();
}

// The XLSX button lives on the DataBase screen and downloads a portable Excel
// archive: the workbook plus the embedded backup the importer reads back.
export async function exportExcelArchive(page, testInfo) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /XLSX$/ }).click();
  const download = await downloadPromise;
  const archivePath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(archivePath);
  return archivePath;
}

// Кнопка импорта одна на все форматы: тип определяется по содержимому файла,
// а не по тому, какую из трёх кнопок нажали.
export async function importFile(page, archivePath) {
  await page.getByTitle("Настройки").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Импорт", exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(archivePath);
}

export async function importExcelArchive(page, archivePath) {
  await importFile(page, archivePath);
  await expect(
    page.getByRole("heading", { name: "Проект уже существует" }),
  ).toBeVisible();
}

export async function leaveSettings(page) {
  await page.getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ }).click();
}

export async function addComponentCard(page, card) {
  await page
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await expect(
    page.getByText("Новый компонент", { exact: true }),
  ).toBeVisible();

  await page.getByLabel(/^Индивидуальный номер/).fill(card.uid);
  await page.getByLabel(/^Номер на схеме/).fill(card.tag);
  await page.getByLabel(/^Локация/).fill(card.location);
  // Уход фокуса — то же, что делает человек, переходя к следующему полю.
  // Пока список подсказок открыт, он перекрывает кнопку «Далее».
  // (Escape тоже закрывает его — это проверено в Autocomplete.test.jsx.)
  await page.getByLabel(/^Компонент/).fill(card.name);
  await page.getByLabel(/^Компонент/).blur();

  await page.getByRole("button", { name: /^Далее/ }).click();
  await page.getByRole("button", { name: /^Далее/ }).click();

  // Третий шаг — паспорт. Именно эти поля утечка забирает у карточки, поэтому
  // без них связь нечем проверять.
  if (card.passport) {
    for (const [label, value] of Object.entries(card.passport)) {
      const field = page.getByLabel(new RegExp(`^${label}`));
      await field.fill(value);
      await field.blur();
    }
  }

  await page.getByRole("button", { name: /^Далее/ }).click();

  // Фото обязательно по умолчанию: карточка без него не сохранится.
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
  await page.getByRole("button", { name: /Сохранить$/ }).click();

  // Со второй карточки приложение предлагает добить пустые поля значениями
  // предыдущей. Каждая карточка здесь описывает своё железо, поэтому
  // отказываемся: иначе манометр унаследовал бы паспорт задвижки.
  const copyPrevious = page.getByRole("button", { name: "Оставить пустыми" });
  if (await copyPrevious.isVisible().catch(() => false)) {
    await copyPrevious.click();
  }

  await expect(
    page.getByRole("button", { name: "Добавить компонент", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  await expect(
    page.getByText(card.name, { exact: true }).first(),
  ).toBeVisible();
}
