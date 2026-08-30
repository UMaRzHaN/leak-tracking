/**
 * capture-manual-screenshots.mjs
 *
 * Снимает скриншоты для docs/MANUAL.md, проходя по приложению так же, как
 * это делает пользователь: создание проекта → добавление утечки → база →
 * мониторинг → реестр компонентов → карта → настройки.
 *
 * Запуск (сервер поднимается отдельно):
 *   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
 *   node scripts/capture-manual-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { encodePngFilesToWebp } from "./image-encoder.mjs";
import { MANUAL_CAPTURE_TIME, freezeClock } from "./manual-capture-time.mjs";

const BASE_URL = process.env.MANUAL_BASE_URL ?? "http://127.0.0.1:4173";
const OUT_DIR = path.resolve("docs/manual/img");
const PHOTO = path.resolve("public/vema_sa_logo.jpg");
// Второй файл нужен только затем, чтобы на вкладке схем было что искать:
// строка поиска появляется, когда чертежей больше одного.
const SCHEMA_SECOND = path.resolve("public/icons/icon-512.png");
const SEED = path.resolve("scripts/seed100leaks.js");

const done = [];
const failed = [];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    permissions: ["geolocation"],
    geolocation: { latitude: 41.297147, longitude: 69.258685 },
    acceptDownloads: true,
  });
  await freezeClock(context);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.log("  [console]", message.text());
  });

  try {
    await step("onboarding", () => onboarding(page));
    await step("addLeak", () => addLeakFlow(page));
    await step("seed", () => seedData(page));
    await step("mainPage", () => mainPageShots(page));
    await step("database", () => databaseShots(page));
    await step("monitoring", () => monitoringShots(page));
    await step("registry", () => registryShots(page));
    await step("map", () => mapShots(page));
    await step("settings", () => settingsShots(page));
    await step("themeAndLanguage", () => themeAndLanguage(page));
  } finally {
    await browser.close();
  }

  await storeShotsAsWebp();

  console.log(`\nГотово: ${done.length} скриншотов`);
  for (const name of done) console.log("  ✓", name);
  if (failed.length) {
    console.log(`\nНе снято: ${failed.length}`);
    for (const item of failed) console.log("  ✗", item);
    process.exitCode = 1;
  }
}

// Возвращает приложение в известное состояние: закрывает модальные окна и
// открывает Главную. Без этого одна неудачная съёмка ломает все следующие.
async function resetToHome(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const close = page.getByRole("button", {
      name: /^(Закрыть|Отмена|Close|Cancel)$/,
    });
    if (!(await close.count())) break;
    await close
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  await openTab(page, "Главная").catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Вкладка нижней навигации — по названию, а не по номеру.
 *
 * Номера съехали, как только у Upstream появился «Реестр»: он встал между
 * «Мониторингом» и «Картой», и `nth(4)` начал открывать реестр вместо карты.
 * Название переживёт и следующую вкладку.
 */
async function openTab(page, name) {
  await page
    .getByRole("contentinfo")
    .getByRole("button", {
      name: name instanceof RegExp ? name : new RegExp(name),
    })
    .first()
    .click();
}

// PNG с экрана весит впятеро больше того же кадра в WebP, а руководство
// переснимают целиком: раз в несколько месяцев это два десятка мегабайт,
// которые остаются в истории навсегда. Кодировщик — тот же Chromium, что
// уже открыт ради съёмки; ставить ничего не нужно.
async function storeShotsAsWebp() {
  const dir = await fs.readdir(OUT_DIR);
  const pngs = dir
    .filter((name) => name.endsWith(".png"))
    .map((name) => path.join(OUT_DIR, name));
  if (pngs.length === 0) return;

  const kb = (bytes) => Math.round(bytes / 1024);
  const { before, after } = await encodePngFilesToWebp(pngs);
  await Promise.all(pngs.map((file) => fs.rm(file, { force: true })));
  console.log(`Кадры пересжаты в WebP: ${kb(before)} КБ → ${kb(after)} КБ`);
}

async function shot(page, name, options = {}) {
  await page.waitForTimeout(options.settle ?? 400);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  done.push(name);
  console.log("  ✓", name);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    failed.push(`${name}: ${error.message.split("\n")[0]}`);
    console.log("  ✗", name, "—", error.message.split("\n")[0]);
  }
}

// --- 1. Стартовый экран и создание проекта -------------------------------

async function onboarding(page) {
  console.log("\n[1] Создание проекта");
  await page.goto(BASE_URL);
  await page.getByLabel("Название проекта", { exact: true }).waitFor();
  await shot(page, "01-project-setup");

  await step("02-project-setup-filled", async () => {
    await page
      .getByLabel("Название проекта", { exact: true })
      .fill("Тенгиз Q1 2026");
    await page.getByRole("button", { name: /Upstream/ }).click();
    await shot(page, "02-project-setup-filled");
  });

  await page.getByRole("button", { name: "Начать работу" }).click();
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .waitFor();
  await shot(page, "03-main-empty");

  await step("04-user-profile", async () => {
    await page.getByTitle("Пользователь").click();
    await page.getByLabel("Имя", { exact: true }).fill("Иванов И.И.");
    await shot(page, "04-user-profile");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page
      .getByRole("heading", { name: "Пользователь", exact: true })
      .waitFor({ state: "detached" });
  });
}

// --- 2. Добавление утечки -------------------------------------------------

async function addLeakFlow(page) {
  console.log("\n[2] Добавление утечки");
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await page.getByText("Новая утечка", { exact: true }).waitFor();
  await shot(page, "05-add-leak-step1");

  await step("06-calc-params", async () => {
    await page.getByRole("button", { name: "Редактировать параметры" }).click();
    const modal = page.locator('[class*="_modal_"]').last();
    await modal.locator('input[type="number"]').first().fill("1");
    await modal.getByLabel(/^Серийный номер оборудования/).fill("20240101");
    await shot(page, "06-calc-params");
    await modal.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page
      .getByRole("heading", { name: "Параметры расчёта" })
      .waitFor({ state: "detached" });
  });

  await step("07-add-leak-step1-filled", async () => {
    await page.getByLabel(/^Бирка/).fill("4242");
    await page.getByLabel(/^Видео/).fill("1042");
    await page.getByLabel(/^Скорость/).fill("1.5");
    await page.getByLabel(/^Подразделение/).fill("НГДУ-1");
    await page.getByLabel(/^Месторождение/).fill("Тенгиз");
    await page.getByLabel(/^Локация/).fill("Куст 12");
    await page.keyboard.press("Escape");
    await shot(page, "07-add-leak-step1-filled");
  });

  await page.getByRole("button", { name: /^Далее/ }).click();
  await page.getByText("Шаг 2 /", { exact: false }).waitFor();
  await shot(page, "08-add-leak-step2");

  await page.getByRole("button", { name: /^Далее/ }).click();
  await page.getByText("Шаг 3 /", { exact: false }).waitFor();
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO);
  await page.getByAltText("Выбранное фото").waitFor();
  await shot(page, "09-add-leak-step3");

  await step("10-leak-saved", async () => {
    await page.getByRole("button", { name: /Сохранить$/ }).click();
    await page.getByRole("heading", { name: "Утечка сохранена" }).waitFor();
    await shot(page, "10-leak-saved");
    await page.getByRole("button", { name: "На главную" }).click();
  });
}

// --- 3. Наполнение демонстрационными данными ------------------------------

async function seedData(page) {
  console.log("\n[3] Тестовые данные");
  const source = await fs.readFile(SEED, "utf8");

  await page.evaluate((now) => {
    window.SEED_LEAK_COUNT = 24;
    // Тот же момент, что у замороженных часов: иначе данные и экран
    // разошлись бы во времени.
    window.SEED_NOW = now;
  }, MANUAL_CAPTURE_TIME.getTime());
  // Сид сам перезагружает страницу в конце, поэтому evaluate обрывается —
  // это ожидаемо, дальше просто ждём главную с новыми данными.
  await page.evaluate(source).catch(() => {});
  await page.waitForTimeout(8000);
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .waitFor({ timeout: 20000 })
    .catch(() => {});
}

// --- 4. Главный экран, карточка, статусы ----------------------------------

async function mainPageShots(page) {
  console.log("\n[4] Главный экран");
  await step("11-main-page", async () => {
    await openTab(page, "Главная");
    await page.locator("[data-urgency]").first().waitFor();
    await shot(page, "11-main-page", { settle: 1200 });
  });

  await step("12-main-filter-open", async () => {
    await page.getByText("Открыто", { exact: true }).first().click();
    await shot(page, "12-main-filter-open");
    await page.getByText("Всего", { exact: true }).first().click();
  });

  await step("13-card-swipe", async () => {
    const card = page.locator("[data-urgency]").first();
    const box = await card.boundingBox();
    const y = box.y + Math.min(box.height / 2, 80);
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 8 });
    await shot(page, "13-card-swipe", { settle: 200 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    await shot(page, "14-leak-details");
  });

  for (const [index, tab] of [
    "Фото",
    "Параметры",
    "Координаты",
    "Мониторинг",
    "Лог",
  ].entries()) {
    await step(`details-${tab}`, async () => {
      await page
        .getByRole("button", { name: tab, exact: true })
        .first()
        .click();
      await shot(page, `${15 + index}-details-${translit(tab)}`, {
        settle: 700,
      });
    });
  }

  // Выбор статуса предлагает ровно один переход — следующий по циклу
  // Открыта → В ремонте → Устранена → Открыта.
  await step("20-status-picker", async () => {
    await page
      .getByRole("button", { name: /^(Открыта|В ремонте|Устранена)$/ })
      .first()
      .click();
    await shot(page, "20-status-picker", { settle: 1400 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.waitForTimeout(500);
  });

  // Окно устранения открывается только для утечки «В ремонте», поэтому
  // сначала включается соответствующий фильтр на главной.
  await step("21-resolve-modal", async () => {
    await page.getByText("В ремонте", { exact: true }).first().click();
    await page.waitForTimeout(700);
    const card = page.locator("[data-urgency]").first();
    const box = await card.boundingBox();
    const y = box.y + Math.min(box.height / 2, 80);
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(900);

    await page
      .getByRole("button", { name: /^(Открыта|В ремонте|Устранена)$/ })
      .first()
      .click();
    await page.waitForTimeout(1000);
    await page
      .getByRole("button", { name: "Устранена", exact: true })
      .last()
      .click();
    await page.getByRole("heading", { name: "Устранение утечки" }).waitFor();
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles(PHOTO);
    await shot(page, "21-resolve-modal", { settle: 900 });
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .first()
      .click();
    await page.waitForTimeout(500);
  });
}

function translit(value) {
  const map = {
    Фото: "photo",
    Параметры: "params",
    Координаты: "coords",
    Мониторинг: "monitoring",
    Лог: "log",
  };
  return map[value] ?? value;
}

// --- 5. Выбор объекта и база данных --------------------------------------

async function databaseShots(page) {
  console.log("\n[5] База данных");
  await resetToHome(page);

  await step("22-location-scope", async () => {
    await page
      .getByRole("button", { name: /Выбор объекта|^Все$/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "Выбор объекта" }).waitFor();
    await shot(page, "22-location-scope", { settle: 700 });
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.waitForTimeout(400);
  });

  await step("23-database", async () => {
    await page.getByRole("button", { name: "База", exact: true }).click();
    await page.locator("[data-urgency]").first().waitFor();
    await shot(page, "23-database", { settle: 1500 });
  });

  await step("24-database-filters", async () => {
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await shot(page, "24-database-filters", { settle: 700 });
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await page.waitForTimeout(400);
  });

  await step("25-database-selection", async () => {
    await page.getByRole("button", { name: "Выбрать всё" }).click();
    await shot(page, "25-database-selection", { settle: 700 });
    await page.getByRole("button", { name: "Снять выбор" }).click();
    await page.waitForTimeout(400);
  });

  await step("26-database-search", async () => {
    await page.getByLabel("Поиск утечек").fill("2405");
    await shot(page, "26-database-search", { settle: 900 });
    await page.getByLabel("Поиск утечек").fill("");
    await page.waitForTimeout(400);
  });
}

// --- 6. Мониторинг --------------------------------------------------------

async function monitoringShots(page) {
  console.log("\n[6] Мониторинг");
  await resetToHome(page);
  await step("27-monitoring", async () => {
    await openTab(page, "Мониторинг");
    await page.waitForTimeout(1500);
    await shot(page, "27-monitoring");
  });

  await step("28-monitoring-start", async () => {
    const start = page.getByRole("button", {
      name: /Начать мониторинг|Новый обход/,
    });
    if (await start.count()) {
      await start.first().click();
      await shot(page, "28-monitoring-start", { settle: 600 });
      await page.getByRole("button", { name: "Начать обход" }).click();
      await page.waitForTimeout(1500);
    }
    await shot(page, "29-monitoring-round");
  });

  await step("30-monitoring-sheet", async () => {
    await page
      .getByRole("button", { name: "Проверить", exact: true })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Проверить", exact: true })
      .waitFor();
    await page
      .getByLabel("Комментарий", { exact: true })
      .fill("Утечка сохраняется, требуется ревизия уплотнения");
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles(PHOTO);
    await shot(page, "30-monitoring-sheet", { settle: 800 });
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.waitForTimeout(1500);
    await shot(page, "31-monitoring-checked");
  });
}

// --- 7. Реестр компонентов ------------------------------------------------

/*
 * Карточки заводятся через ту же форму, что и у пользователя.
 *
 * Первая попытка сажала их прямо в IndexedDB через page.evaluate — и повисала
 * навсегда: у evaluate нет таймаута, а исключение внутри обработчика IDB не
 * доходит ни до resolve, ни до reject. Через форму одна карточка занимает
 * секунду, и снимок показывает то же, что увидит человек.
 */
const REGISTRY_CARDS = [
  { uid: "4242", tag: "ЗД-32", location: "Куст 12", name: "Задвижка" },
  { uid: "4243", tag: "КШ-7", location: "Куст 12", name: "Кран Шаровой" },
  { uid: "4244", tag: "PG-3", location: "Куст 14", name: "Манометр" },
  { uid: "4245", tag: "ОК-1", location: "Куст 14", name: "Обратный Клапан" },
];

async function addComponentCard(page, card, { captureForm = false } = {}) {
  await page
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await page.getByText("Новый компонент", { exact: true }).waitFor();

  await page.getByLabel(/^Индивидуальный номер/).fill(card.uid);
  await page.getByLabel(/^Номер на схеме/).fill(card.tag);
  await page.getByLabel(/^Локация/).fill(card.location);
  await page.getByLabel(/^Компонент/).fill(card.name);
  // Автодополнение перекрывает нижние поля — закрываем перед снимком.
  await page.keyboard.press("Escape");
  if (captureForm) await shot(page, "34-registry-card", { settle: 500 });

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: /^Далее/ }).click();
    await page.waitForTimeout(350);
  }
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(PHOTO);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Сохранить$/ }).click();
  await page
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .waitFor({ timeout: 30000 });
}

async function registryShots(page) {
  console.log("\n[7] Реестр компонентов");
  await resetToHome(page);
  await openTab(page, "Реестр");
  await page.waitForTimeout(800);

  await step("registry-cards", async () => {
    for (const [index, card] of REGISTRY_CARDS.entries()) {
      await addComponentCard(page, card, { captureForm: index === 0 });
    }
  });

  /*
   * Осмотр до снимков списка и фильтров, а не после: состояние — это то, что
   * записывают при обходе, и без него на карточках нечего показывать, а в
   * фильтре нечего отбирать. Списком всем сразу, потом одному свайпом — так
   * состояний становится два, как и бывает на площадке.
   */
  await step("registry-inspect", async () => {
    await page.getByRole("button", { name: "Выбрать всё" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Сменить статус" }).click();
    await page
      .getByRole("dialog", { name: /Состояние на момент осмотра/ })
      .waitFor();
    await page.getByRole("button", { name: "В работе", exact: true }).click();
    await page.waitForTimeout(1500);

    const card = page.getByText("Манометр", { exact: true }).first();
    const box = await card.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 150, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, y, { steps: 8 });
    await page.mouse.up();
    await page
      .getByRole("dialog", { name: /Состояние на момент осмотра/ })
      .waitFor();
    await page
      .getByRole("button", { name: "Требует замены", exact: true })
      .click();
    await page.waitForTimeout(1500);
  });

  await step("32-registry-list", async () => {
    await shot(page, "32-registry-list", { settle: 900 });
  });

  await step("33-registry-filters", async () => {
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await shot(page, "33-registry-filters", { settle: 700 });
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await page.waitForTimeout(400);
  });

  await step("35-registry-details", async () => {
    await page.getByText("Задвижка", { exact: true }).first().click();
    await page
      .getByRole("dialog", { name: "Карточка компонента" })
      .waitFor({ timeout: 10000 });
    await shot(page, "35-registry-details", { settle: 800 });
  });

  await step("36-registry-history", async () => {
    await page.getByRole("button", { name: "История", exact: true }).click();
    await shot(page, "36-registry-history", { settle: 700 });
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.waitForTimeout(500);
  });

  await step("37-schemas", async () => {
    await page.getByRole("tab", { name: "Схемы", exact: true }).click();
    await page.waitForTimeout(600);
    const picker = page.locator('input[type="file"][accept*="pdf"]');
    await picker.setInputFiles(PHOTO);
    await page.waitForTimeout(1500);
    await picker.setInputFiles(SCHEMA_SECOND);
    await page.waitForTimeout(1500);
    await shot(page, "37-schemas", { settle: 700 });
  });

  await step("38-map-components", async () => {
    await openTab(page, "Карта");
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Переключить базу/ }).click();
    await shot(page, "38-map-components", { settle: 2500 });
  });
}

// --- 8. Карта -------------------------------------------------------------

async function mapShots(page) {
  console.log("\n[8] Карта");
  await resetToHome(page);
  await step("39-map", async () => {
    await openTab(page, "Карта");
    await page.waitForTimeout(9000);
    await shot(page, "39-map");
  });

  await step("40-map-filters", async () => {
    await page.getByRole("button", { name: "Фильтр по мониторингу" }).click();
    await shot(page, "40-map-filters", { settle: 900 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });
}

// --- 9. Настройки ---------------------------------------------------------

const SETTINGS_SECTIONS = [
  ["41-settings-projects", "Проекты"],
  ["42-settings-fields", "Поля формы и Excel"],
  ["43-settings-photos", "Требования к фото"],
  ["44-settings-backup", "Резервная копия"],
  // Последний снимок захватывает сразу «Проверку данных», «Кэш карты» и
  // «Опасную зону»: страница на них заканчивается и дальше не прокручивается.
  ["45-settings-bottom", "Проверка данных"],
];

async function settingsShots(page) {
  console.log("\n[9] Настройки");
  await resetToHome(page);
  await step("open-settings", async () => {
    await page.getByTitle("Настройки").click();
    await page.getByRole("heading", { name: "Проекты" }).first().waitFor();
    await page.waitForTimeout(900);
  });

  for (const [name, heading] of SETTINGS_SECTIONS) {
    await step(name, async () => {
      const title = page.getByRole("heading", { name: heading }).first();
      // scrollIntoViewIfNeeded оставляет уже видимый заголовок на месте, из-за
      // чего соседние секции попадают на один снимок. block: "center" ещё и
      // уводит заголовок из-под липкой шапки.
      await title.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await shot(page, name, { settle: 700 });
    });
  }

  await step("46-field-visibility", async () => {
    const button = page.getByRole("button", { name: "Настроить поля" }).first();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.getByRole("heading", { name: "Настройка полей" }).waitFor();
    await shot(page, "46-field-visibility", { settle: 800 });
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .first()
      .click();
    await page.waitForTimeout(500);
  });
}

// --- 10. Тема и язык -------------------------------------------------------

async function themeAndLanguage(page) {
  console.log("\n[10] Тема и язык");
  await step("47-dark-theme", async () => {
    const toggle = page.getByRole("button", { name: "Переключить тему" });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await page.waitForTimeout(600);
    await page
      .getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ })
      .click();
    await page.waitForTimeout(900);
    await openTab(page, /Главная|Home/);
    await page.waitForTimeout(1200);
    await shot(page, "47-dark-theme", { settle: 1500 });
  });

  await step("48-english", async () => {
    await page.getByTitle(/Настройки|Settings/).click();
    await page.waitForTimeout(800);
    const language = page.getByRole("button", {
      name: /Переключить язык|Toggle language/,
    });
    await language.scrollIntoViewIfNeeded();
    await language.click();
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ })
      .click();
    await page.waitForTimeout(900);
    await openTab(page, /Главная|Home/);
    await page.waitForTimeout(1200);
    await shot(page, "48-english", { settle: 1200 });
  });
}

await main();
