import { expect, test } from "@playwright/test";
import {
  PHOTO_FIXTURE,
  createProject,
  importFile,
  leaveSettings,
  openComponentRegistry,
  setUserProfile,
} from "./helpers.js";

/*
 * Реестр компонентов от заведения карточки до архива и обратно.
 *
 * Это единственный путь, на котором данные покидают устройство и
 * возвращаются: карточка заводится у железа, уходит XLSX-архивом тому, кто
 * этим железом владеет, и вливается на другом устройстве. Разрыв в любом
 * звене — это потерянный обход, а не неудобство, поэтому путь проверяется
 * целиком, а не по частям.
 */

async function addComponentCard(page, card) {
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

  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: /^Далее/ }).click();
  }

  // Фото обязательно по умолчанию: карточка без него не сохранится.
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByAltText("Выбранное фото")).toBeVisible();
  await page.getByRole("button", { name: /Сохранить$/ }).click();

  await expect(
    page.getByRole("button", { name: "Добавить компонент", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  await expect(
    page.getByText(card.name, { exact: true }).first(),
  ).toBeVisible();
}

const VALVE = {
  uid: "9001",
  tag: "ЗД-32",
  location: "Куст 12",
  name: "Задвижка",
};
const GAUGE = {
  uid: "9002",
  tag: "PG-3",
  location: "Куст 14",
  name: "Манометр",
};

test("заводит карточку компонента и показывает её в реестре", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createProject(page, "Registry E2E");
  await setUserProfile(page);
  await openComponentRegistry(page);

  await expect(page.getByText("Заведено: 0")).toBeVisible();
  await expect(page.getByText("Реестр пуст.", { exact: false })).toBeVisible();

  await addComponentCard(page, VALVE);

  await expect(page.getByText("Заведено: 1")).toBeVisible();
  await expect(page.getByText("ЗД-32", { exact: false }).first()).toBeVisible();

  // Реестр живёт в той же базе, что и утечки, — перезагрузка это проверяет.
  await page.reload();
  await openComponentRegistry(page);
  await expect(page.getByText("Заведено: 1")).toBeVisible();
  await expect(
    page.getByText("Задвижка", { exact: true }).first(),
  ).toBeVisible();
});

test("выгружает инвентаризацию и вливает её в другой проект", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await createProject(page, "Registry Export");
  await setUserProfile(page);
  await openComponentRegistry(page);

  await addComponentCard(page, VALVE);
  await addComponentCard(page, GAUGE);
  await expect(page.getByText("Заведено: 2")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /XLSX$/ }).click();
  const download = await downloadPromise;
  const archivePath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(archivePath);

  // Второй проект того же типа: архив не несёт ни имени, ни типа, и тип
  // выводится как единственный, у которого объявлен реестр.
  await page.getByTitle("Настройки").click();
  await page.getByRole("button", { name: "+ Добавить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Новый проект", exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Например: Тенгиз Q1 2026")
    .fill("Registry Import");
  // На первом экране типы подписаны Upstream/Midstream/Downstream, в
  // настройках — по-русски.
  await page.getByRole("button", { name: "⛽ Добыча Добыча" }).click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await leaveSettings(page);

  await openComponentRegistry(page);
  await expect(page.getByText("Заведено: 0")).toBeVisible();

  await importFile(page, archivePath);
  await expect(page.getByRole("alert")).toContainText("Инвентаризация", {
    timeout: 30_000,
  });
  await expect(page.getByRole("alert")).toContainText("2");
  await leaveSettings(page);

  await openComponentRegistry(page);
  await expect(page.getByText("Заведено: 2")).toBeVisible();
  await expect(
    page.getByText("Задвижка", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Манометр", { exact: true }).first(),
  ).toBeVisible();
});
