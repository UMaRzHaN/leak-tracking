import { expect, test } from "@playwright/test";
import {
  addComponentCard,
  createProject,
  openComponentRegistry,
  openMap,
  setUserProfile,
} from "./helpers.js";

/*
 * Отбор железа общий у реестра и карты.
 *
 * Раньше «рядом» и состояние жили внутри страницы реестра, и переход на карту
 * начинался с чистого листа: человек отбирал требующее замены, открывал карту
 * и видел все булавки разом — то есть отбор молча терялся ровно там, где по
 * нему собираются идти. Проверяется поэтому не хранилище, а стык: выбрано на
 * одном экране — видно на другом, и наоборот.
 *
 * Карточки заводятся через форму и с разных точек: одна координата на всех
 * склеила бы булавки в кластер, и по карте нельзя было бы сказать, какая
 * осталась. Точки при этом соседние — карта открывается по последнему
 * положению GPS, и разнеси их на километры, вторая булавка ушла бы за край:
 * «не видно» тогда значило бы «не в кадре», а не «отобрано».
 */

const VALVE = {
  uid: "9001",
  tag: "ЗД-32",
  location: "Куст 12",
  name: "Задвижка",
  passport: { "Статус компонента": "В работе" },
};
const GAUGE = {
  uid: "9002",
  tag: "PG-3",
  location: "Куст 14",
  name: "Манометр",
  passport: { "Статус компонента": "Требует замены" },
};

function marker(page, uid) {
  return page.locator(".leaflet-marker-icon", { hasText: uid });
}

test("несёт отбор по состоянию из реестра на карту и обратно", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await createProject(page, "Registry Map Filter");
  await setUserProfile(page);
  await openComponentRegistry(page);

  await context.setGeolocation({ latitude: 41.311081, longitude: 69.240562 });
  await addComponentCard(page, VALVE);
  await context.setGeolocation({ latitude: 41.3155, longitude: 69.2455 });
  await addComponentCard(page, GAUGE);

  // Отбор ставится в реестре.
  await page.getByRole("button", { name: "Фильтры" }).click();
  // В реестре у кнопки состояния в имени ещё и счётчик карточек.
  await page.getByRole("button", { name: /^Требует замены/ }).click();
  await expect(page.getByText("Манометр", { exact: true })).toBeVisible();
  await expect(page.getByText("Задвижка", { exact: true })).toHaveCount(0);

  // И действует на карте, где его никто не повторял.
  await openMap(page);
  await page.getByRole("button", { name: /Переключить базу/ }).click();
  await expect(marker(page, "9002")).toBeVisible({ timeout: 30_000 });
  await expect(marker(page, "9001")).toHaveCount(0);

  // Кнопка карты показывает то же выбранное, а не своё. Отбор ищется внутри
  // своей обёртки: «Все» есть и в шапке — это переключатель папок.
  const mapFilter = page.locator('[class*="filterControlWrap"]', {
    has: page.getByRole("button", { name: "Фильтр по состоянию железа" }),
  });
  await mapFilter
    .getByRole("button", { name: "Фильтр по состоянию железа" })
    .click();
  await expect(
    mapFilter.getByRole("button", { name: "Требует замены", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Снятое на карте снято и в реестре: набор один, а не два похожих.
  await mapFilter.getByRole("button", { name: "Все", exact: true }).click();
  await expect(marker(page, "9001")).toBeVisible();

  await openComponentRegistry(page);
  await expect(page.getByText("Задвижка", { exact: true })).toBeVisible();
  await expect(page.getByText("Манометр", { exact: true })).toBeVisible();
});
