import { expect, test } from "@playwright/test";
import {
  PHOTO_FIXTURE,
  createProject,
  fillLeakStepOne,
  footerTab,
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

const VALVE = {
  uid: "9001",
  tag: "ЗД-32",
  location: "Куст 12",
  name: "Задвижка",
  passport: {
    "Тип присоединения": "Фланцевое соединение",
    "Тип привода": "Механический ручной",
  },
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

/*
 * Связь утечки с карточкой.
 *
 * Компонент — постоянный объект учёта, утечка — событие на нём. Ключи у обеих
 * сущностей общие намеренно, чтобы связь была прямым копированием; здесь
 * проверяется, что копирование действительно доходит до сохранённой утечки.
 */
test("привязывает утечку к карточке компонента", async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, "Registry Link");
  await setUserProfile(page);
  await openComponentRegistry(page);
  await addComponentCard(page, VALVE);

  await footerTab(page, "Главная").click();
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await expect(page.getByText("Новая утечка", { exact: true })).toBeVisible();

  // Пока карточка не выбрана — приглашение выбрать.
  const pick = page.getByRole("button", { name: "Выбрать из реестра" });
  await expect(pick).toBeVisible();
  await pick.click();

  await expect(
    page.getByRole("dialog", { name: "Компонент из реестра" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /№9001/ }).click();

  // Выбранная карточка подписана номером и наименованием, а паспортные поля
  // проставлены за обходчика.
  await expect(page.getByText("№9001 · Задвижка")).toBeVisible();
  await expect(page.getByLabel(/^Компонент$/)).toHaveValue("Задвижка");

  await fillLeakStepOne(page, "7001");
  await page.getByRole("button", { name: /^Далее/ }).click();
  await expect(page.getByText("Шаг 2 /", { exact: false })).toBeVisible();
  await expect(page.getByLabel(/^Тип присоединения/)).toHaveValue(
    "Фланцевое соединение",
  );
  await expect(page.getByLabel(/^Тип привода/)).toHaveValue(
    "Механический ручной",
  );
});

test("открепляет карточку, оставляя заполненное", async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, "Registry Unlink");
  await setUserProfile(page);
  await openComponentRegistry(page);
  await addComponentCard(page, VALVE);

  await footerTab(page, "Главная").click();
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await page.getByRole("button", { name: "Выбрать из реестра" }).click();
  await page.getByRole("button", { name: /№9001/ }).click();
  await expect(page.getByText("№9001 · Задвижка")).toBeVisible();

  await page.getByRole("button", { name: "Открепить" }).click();

  // Ссылки нет, а перенесённое остаётся: часть могла быть исправлена руками.
  await expect(page.getByText("№9001 · Задвижка")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Выбрать из реестра" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Компонент$/)).toHaveValue("Задвижка");
});
