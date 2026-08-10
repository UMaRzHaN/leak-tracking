/**
 * capture-manual-screenshots.mjs
 *
 * Снимает скриншоты для docs/MANUAL.md, проходя по приложению так же, как
 * это делает пользователь: создание проекта → добавление утечки → база →
 * мониторинг → карта → настройки.
 *
 * Запуск (сервер поднимается отдельно):
 *   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
 *   node scripts/capture-manual-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MANUAL_BASE_URL ?? "http://127.0.0.1:4173";
const OUT_DIR = path.resolve("docs/manual/img");
const PHOTO = path.resolve("public/vema_sa_logo.jpg");
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
    await step("map", () => mapShots(page));
    await step("settings", () => settingsShots(page));
    await step("themeAndLanguage", () => themeAndLanguage(page));
  } finally {
    await browser.close();
  }

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
  await page
    .getByRole("contentinfo")
    .getByRole("button")
    .nth(0)
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(600);
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

  await page.evaluate(() => {
    window.SEED_LEAK_COUNT = 24;
  });
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
    await page.getByRole("contentinfo").getByRole("button").nth(0).click();
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
    await page.getByRole("contentinfo").getByRole("button").nth(3).click();
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

// --- 7. Карта -------------------------------------------------------------

async function mapShots(page) {
  console.log("\n[7] Карта");
  await resetToHome(page);
  await step("32-map", async () => {
    await page.getByRole("contentinfo").getByRole("button").nth(4).click();
    await page.waitForTimeout(9000);
    await shot(page, "32-map");
  });

  await step("33-map-filters", async () => {
    await page.getByRole("button", { name: "Фильтр по мониторингу" }).click();
    await shot(page, "33-map-filters", { settle: 900 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });
}

// --- 8. Настройки ---------------------------------------------------------

const SETTINGS_SECTIONS = [
  ["34-settings-projects", "Проекты"],
  ["35-settings-fields", "Поля формы и Excel"],
  ["36-settings-photos", "Требования к фото"],
  ["37-settings-backup", "Резервная копия"],
  // Последний снимок захватывает сразу «Проверку данных», «Кэш карты» и
  // «Опасную зону»: страница на них заканчивается и дальше не прокручивается.
  ["38-settings-bottom", "Проверка данных"],
];

async function settingsShots(page) {
  console.log("\n[8] Настройки");
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

  await step("39-field-visibility", async () => {
    const button = page.getByRole("button", { name: "Настроить поля" }).first();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.getByRole("heading", { name: "Настройка полей" }).waitFor();
    await shot(page, "39-field-visibility", { settle: 800 });
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .first()
      .click();
    await page.waitForTimeout(500);
  });
}

// --- 9. Тема и язык -------------------------------------------------------

async function themeAndLanguage(page) {
  console.log("\n[9] Тема и язык");
  await step("40-dark-theme", async () => {
    const toggle = page.getByRole("button", { name: "Переключить тему" });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await page.waitForTimeout(600);
    await page
      .getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ })
      .click();
    await page.waitForTimeout(900);
    await page.getByRole("contentinfo").getByRole("button").nth(0).click();
    await page.waitForTimeout(1200);
    await shot(page, "40-dark-theme", { settle: 1500 });
  });

  await step("41-english", async () => {
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
    await page.getByRole("contentinfo").getByRole("button").nth(0).click();
    await page.waitForTimeout(1200);
    await shot(page, "41-english", { settle: 1200 });
  });
}

await main();
