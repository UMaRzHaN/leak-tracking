/**
 * capture-android-manual-screenshots.mjs
 *
 * Снимает экраны Android-сборки для docs/Leak-Tracker-Android-Manual.pdf.
 *
 * Приложение управляется через WebView DevTools (Playwright подключается к
 * отладочному сокету WebView по CDP), а кадры снимаются целиком с устройства —
 * поэтому на них видна системная строка состояния и родные диалоги.
 *
 * Требуется подключённое устройство или запущенный эмулятор с установленной
 * debug-сборкой (у неё включена отладка WebView) и adb в PATH:
 *
 *   npm run build && npx cap sync android
 *   (cd android && ./gradlew assembleDebug)
 *   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
 *   node scripts/capture-android-manual-screenshots.mjs
 *
 * Один раздел вместо всего набора:
 *
 *   ANDROID_CAPTURE_SECTIONS=map node scripts/capture-android-manual-screenshots.mjs
 */
import { _android as android } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { MANUAL_CAPTURE_TIME } from "./manual-capture-time.mjs";
import {
  hideKeyboard,
  openWebView,
  resizeStoredShots,
  sendEmulatorLocation,
  storeShotsAsWebp,
  wait,
} from "./android-capture-device.mjs";

const PKG = process.env.ANDROID_PKG ?? "com.leak.tracking.debug";
// Точка, вокруг которой seed100leaks.js расставляет утечки: на эмуляторе
// местоположение приходится задавать вручную, иначе GPS ищет вечно.
const GEO = { lat: 41.297147, lng: 69.258685 };
const OUT_DIR = path.resolve("docs/manual/android/img");
const SEED = path.resolve("scripts/seed100leaks.js");
const SEED_COUNT = Number(process.env.ANDROID_SEED_COUNT ?? 18);
// Карточки реестра: завести их через интерфейс нельзя — фото на устройстве
// берёт нативная камера, и через WebView файл не подставить.
const SEED_COMPONENTS = Number(process.env.ANDROID_SEED_COMPONENTS ?? 8);
// Ширина хранимого кадра: экран устройства 1080 px, для PDF хватает половины.
const STORED_WIDTH = 540;

/*
 * Какие разделы снимать: `ANDROID_CAPTURE_SECTIONS=map` вместо всего набора.
 *
 * Понадобилось, когда в руководство добавился один снимок: полный проход
 * переписывает все сорок с лишним кадров, а различие в нетронутых — часы
 * системной строки, которые заморозке страницы не подчиняются. Ради одной
 * картинки платить сорока одной подделкой истории незачем.
 *
 * Путь до наполнения данными не выбирается — он нужен любому разделу.
 */
const SECTIONS = (process.env.ANDROID_CAPTURE_SECTIONS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

function wanted(section) {
  return SECTIONS.length === 0 || SECTIONS.includes(section);
}

const done = [];
const failed = [];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const [device] = await android.devices();
  if (!device) throw new Error("Устройство не найдено: проверьте adb devices");
  console.log(`Устройство: ${device.model()} / ${device.serial()}`);

  // Чистый старт: без этого сценарий начался бы с уже созданным проектом.
  await device.shell(`pm clear ${PKG}`);
  await device.shell(`pm grant ${PKG} android.permission.ACCESS_FINE_LOCATION`);
  await device.shell(
    `pm grant ${PKG} android.permission.ACCESS_COARSE_LOCATION`,
  );
  await device.shell(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
  await wait(7000);
  sendEmulatorLocation(device, GEO);

  const page = await openWebView(device, PKG);

  try {
    // Начало пути не выбирается: `pm clear` оставил телефон с пустым
    // приложением, и без проекта, утечки и наполнения снимать нечего.
    await step("onboarding", () => onboarding(device, page));
    await step("addLeak", () => addLeakForm(device, page));
    await step("seed", () => seedData(device, page));
    const seeded = await openWebView(device, PKG);
    const sections =
      /** @type {[string, (device: any, page: any) => Promise<void>][]} */ ([
        ["mainPage", mainPageShots],
        ["database", databaseShots],
        ["monitoring", monitoringShots],
        ["map", mapShots],
        ["registry", registryShots],
        ["settings", settingsShots],
        ["themeAndLanguage", themeAndLanguage],
      ]);
    for (const [name, shots] of sections) {
      if (wanted(name)) await step(name, () => shots(device, seeded));
    }
  } finally {
    await device.close();
  }

  await resizeStoredShots(OUT_DIR, STORED_WIDTH);
  await storeShotsAsWebp(OUT_DIR);

  console.log(`\nГотово: ${done.length} экранов`);
  for (const name of done) console.log("  ✓", name);
  if (failed.length) {
    console.log(`\nНе снято: ${failed.length}`);
    for (const item of failed) console.log("  ✗", item);
    process.exitCode = 1;
  }
}

/**
 * Вкладка выбирается по названию, а не по номеру.
 *
 * Номера съехали, как только у Upstream появился «Реестр»: он встал между
 * «Мониторингом» и «Картой», и `nth(4)` начал открывать реестр вместо карты —
 * снимок «27-map» показывал не то, а «28-map-filters» падал, потому что у
 * реестра нет фильтра по мониторингу. Название переживёт и следующую вкладку.
 *
 * Съёмка доходит до английского интерфейса, поэтому имя — регулярное выражение
 * на оба языка: после переключения «Главная» становится «Home».
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

async function shot(device, name, options = {}) {
  await hideKeyboard();
  await wait(options.settle ?? 600);
  await device.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
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
    await wait(400);
  }
  await page
    .getByRole("contentinfo")
    .getByRole("button")
    .nth(0)
    .click({ timeout: 5000 })
    .catch(() => {});
  await wait(700);
}

// --- 1. Первый запуск ------------------------------------------------------

async function onboarding(device, page) {
  console.log("\n[1] Первый запуск");
  await page.getByLabel("Название проекта", { exact: true }).waitFor();
  await shot(device, "01-project-setup");

  await page
    .getByLabel("Название проекта", { exact: true })
    .fill("Тенгиз Q1 2026");
  await page.getByRole("button", { name: /Upstream/ }).click();
  await shot(device, "02-project-setup-filled");

  await page.getByRole("button", { name: "Начать работу" }).click();
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .waitFor();
  await shot(device, "03-main-empty");

  await step("04-user-profile", async () => {
    await page.getByTitle("Пользователь").click();
    await page.getByLabel("Имя", { exact: true }).waitFor();
    await shot(device, "04-user-profile");
    await page.getByLabel("Имя", { exact: true }).fill("Иванов И.И.");
    await hideKeyboard();
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await wait(800);
  });

  // GPS на Android по умолчанию выключен; включаем — в шапке появляются
  // координаты, и они же попадут в новые записи.
  await step("05-gps-on", async () => {
    await page.getByTitle(/GPS/).click();
    await wait(2000);
    sendEmulatorLocation(device, GEO);
    await page
      .getByText(/\d+\.\d+\s*\/\s*\d+\.\d+/)
      .waitFor({ timeout: 30000 });
    await shot(device, "05-gps-on");
  });
}

// --- 2. Форма добавления утечки -------------------------------------------

async function addLeakForm(device, page) {
  console.log("\n[2] Добавление утечки");
  await page
    .getByRole("button", { name: "Добавить утечку", exact: true })
    .click();
  await page.getByText("Новая утечка", { exact: true }).waitFor();
  await shot(device, "06-add-leak-step1");

  await step("07-calc-params", async () => {
    await page.getByRole("button", { name: "Редактировать параметры" }).click();
    const modal = page.locator('[class*="_modal_"]').last();
    await modal.locator('input[type="number"]').first().fill("1");
    await modal.getByLabel(/^Серийный номер оборудования/).fill("20240101");
    await shot(device, "07-calc-params");
    await modal.getByRole("button", { name: "Сохранить", exact: true }).click();
    await wait(700);
  });

  await step("08-add-leak-step1-filled", async () => {
    await page.getByLabel(/^Бирка/).fill("4242");
    await page.getByLabel(/^Видео/).fill("1042");
    await page.getByLabel(/^Скорость/).fill("1.5");
    await page.getByLabel(/^Подразделение/).fill("НГДУ-1");
    await page.getByLabel(/^Месторождение/).fill("Тенгиз");
    await page.getByLabel(/^Локация/).fill("Куст 12");
    await page.keyboard.press("Escape");
    await shot(device, "08-add-leak-step1-filled");
  });

  await page.getByRole("button", { name: /^Далее/ }).click();
  await page.getByText("Шаг 2 /", { exact: false }).waitFor();
  await shot(device, "09-add-leak-step2");

  await page.getByRole("button", { name: /^Далее/ }).click();
  await page.getByText("Шаг 3 /", { exact: false }).waitFor();
  // На Android третий шаг предлагает «Камера» и «Галерея» — родные плагины,
  // веб-версия вместо них показывает выбор файла.
  await shot(device, "10-add-leak-step3");

  await page.locator('button[aria-label="← Назад"]').click();
  await wait(1200);
}

// --- 3. Демонстрационные данные -------------------------------------------

async function seedData(device, page) {
  console.log("\n[3] Тестовые данные");
  const source = await fs.readFile(SEED, "utf8");
  await page.evaluate(
    ({ leaks, components, now }) => {
      window.SEED_LEAK_COUNT = leaks;
      window.SEED_COMPONENT_COUNT = components;
      // Тот же момент, что у замороженных часов: иначе данные и экран
      // разошлись бы во времени.
      window.SEED_NOW = now;
    },
    {
      leaks: SEED_COUNT,
      components: SEED_COMPONENTS,
      now: MANUAL_CAPTURE_TIME.getTime(),
    },
  );
  await page.evaluate(source).catch(() => {});
  await wait(30000);
}

// --- 4. Главная и карточка -------------------------------------------------

async function mainPageShots(device, page) {
  console.log("\n[4] Главный экран");
  await resetToHome(page);
  await page.locator("[data-urgency]").first().waitFor();
  await shot(device, "11-main-page", { settle: 1500 });

  await step("12-card-swipe", async () => {
    const card = page.locator("[data-urgency]").first();
    const box = await card.boundingBox();
    const y = box.y + Math.min(box.height / 2, 80);
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 8 });
    await shot(device, "12-card-swipe", { settle: 300 });
    await page.mouse.up();
    await wait(900);
    await shot(device, "13-leak-details");
  });

  for (const [index, tab] of [
    ["Фото", "photo"],
    ["Мониторинг", "monitoring"],
    ["Лог", "log"],
  ].entries()) {
    await step(`details-${tab[1]}`, async () => {
      await page
        .getByRole("button", { name: tab[0], exact: true })
        .first()
        .click();
      await shot(device, `${14 + index}-details-${tab[1]}`, { settle: 800 });
    });
  }

  await step("17-status-picker", async () => {
    await page
      .getByRole("button", { name: /^(Открыта|В ремонте|Устранена)$/ })
      .first()
      .click();
    await shot(device, "17-status-picker", { settle: 1400 });
    await page.keyboard.press("Escape");
    await wait(500);
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await wait(600);
  });

  await step("18-resolve-modal", async () => {
    await page.getByText("В ремонте", { exact: true }).first().click();
    await wait(800);
    const card = page.locator("[data-urgency]").first();
    const box = await card.boundingBox();
    const y = box.y + Math.min(box.height / 2, 80);
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, y, { steps: 8 });
    await page.mouse.up();
    await wait(1000);
    await page
      .getByRole("button", { name: /^(Открыта|В ремонте|Устранена)$/ })
      .first()
      .click();
    await wait(1000);
    await page
      .getByRole("button", { name: "Устранена", exact: true })
      .last()
      .click();
    await page.getByRole("heading", { name: "Устранение утечки" }).waitFor();
    await shot(device, "18-resolve-modal", { settle: 900 });
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .first()
      .click();
    await wait(600);
  });
}

// --- 5. Выбор объекта и база ----------------------------------------------

async function databaseShots(device, page) {
  console.log("\n[5] База данных");
  await resetToHome(page);

  await step("19-location-scope", async () => {
    await page
      .getByRole("button", { name: /Выбор объекта|^Все$/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "Выбор объекта" }).waitFor();
    await shot(device, "19-location-scope", { settle: 800 });
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await wait(600);
  });

  await step("20-database", async () => {
    await page.getByRole("button", { name: "База", exact: true }).click();
    await page.locator("[data-urgency]").first().waitFor();
    await shot(device, "20-database", { settle: 1500 });
  });

  await step("21-database-filters", async () => {
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await shot(device, "21-database-filters", { settle: 800 });
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await wait(500);
  });

  await step("22-database-selection", async () => {
    await page.getByRole("button", { name: "Выбрать всё" }).click();
    await shot(device, "22-database-selection", { settle: 800 });
    await page.getByRole("button", { name: "Снять выбор" }).click();
    await wait(500);
  });
}

// --- 6. Мониторинг ---------------------------------------------------------

async function monitoringShots(device, page) {
  console.log("\n[6] Мониторинг");
  await resetToHome(page);

  await step("23-monitoring", async () => {
    await openTab(page, /Мониторинг|Monitoring/);
    await wait(1800);
    await shot(device, "23-monitoring");
  });

  await step("24-monitoring-start", async () => {
    const start = page.getByRole("button", {
      name: /Начать мониторинг|Новый обход/,
    });
    if (await start.count()) {
      await start.first().click();
      await shot(device, "24-monitoring-start", { settle: 700 });
      await page.getByRole("button", { name: "Начать обход" }).click();
      await wait(1800);
    }
    await shot(device, "25-monitoring-round");
  });

  await step("26-monitoring-sheet", async () => {
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
    await shot(device, "26-monitoring-sheet", { settle: 900 });
    await page
      .getByRole("button", { name: "Закрыть", exact: true })
      .first()
      .click();
    await wait(700);
  });
}

// --- 7. Карта --------------------------------------------------------------

async function mapShots(device, page) {
  console.log("\n[7] Карта");
  await resetToHome(page);

  await step("27-map", async () => {
    await openTab(page, /Карта|Map/);
    await wait(9000);
    await shot(device, "27-map");
  });

  await step("28-map-filters", async () => {
    await page.getByRole("button", { name: "Фильтр по мониторингу" }).click();
    await shot(device, "28-map-filters", { settle: 1000 });
    await page.keyboard.press("Escape");
    await wait(600);
  });

  /*
   * Вторая база карты — на ней другие кнопки, и снимать её нужно отдельно.
   * Отбор по состоянию открыт нарочно: он общий с реестром, и картинка со
   * свёрнутой кнопкой не отличалась бы от базы утечек ничем, кроме пилюли.
   */
  await step("43-map-components", async () => {
    await page.getByRole("button", { name: /Переключить базу/ }).click();
    await wait(1500);
    await page
      .getByRole("button", { name: "Фильтр по состоянию железа" })
      .click();
    await shot(device, "43-map-components", { settle: 1000 });
    await page.keyboard.press("Escape");
    await wait(600);
  });
}

// --- 7a. Реестр компонентов ------------------------------------------------

async function registryShots(device, page) {
  console.log("\n[7a] Реестр компонентов");
  await resetToHome(page);

  await step("39-registry-list", async () => {
    await openTab(page, /Реестр|Registry/);
    await page.getByRole("heading", { name: "Реестр компонентов" }).waitFor();
    await shot(device, "39-registry-list", { settle: 1500 });
  });

  await step("40-registry-filters", async () => {
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await shot(device, "40-registry-filters", { settle: 800 });
    await page.getByRole("button", { name: "Фильтры" }).first().click();
    await wait(500);
  });

  await step("41-registry-card", async () => {
    await page
      .getByRole("button", { name: "Добавить компонент", exact: true })
      .click();
    await page.getByText("Новый компонент", { exact: true }).waitFor();
    await shot(device, "41-registry-card", { settle: 800 });
    await page
      .getByRole("button", { name: /Отмена|Назад/ })
      .first()
      .click();
    await wait(800);
  });

  await step("42-registry-details", async () => {
    // Карточка открывается нажатием на неё, как и в веб-скрипте.
    await page.getByText("9001", { exact: true }).first().click();
    await page
      .getByRole("dialog", { name: "Карточка компонента" })
      .waitFor({ timeout: 10000 });
    await shot(device, "42-registry-details", { settle: 800 });
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await wait(600);
  });
}

// --- 8. Настройки ----------------------------------------------------------

const SETTINGS_SECTIONS = [
  ["29-settings-projects", "Проекты"],
  ["30-settings-fields", "Поля формы и Excel"],
  ["31-settings-photos", "Требования к фото"],
  ["32-settings-backup", "Резервная копия"],
  ["33-settings-sync", "Локальная синхронизация"],
  ["34-settings-bottom", "Проверка данных"],
];

async function settingsShots(device, page) {
  console.log("\n[8] Настройки");
  await resetToHome(page);
  await page.getByTitle("Настройки").click();
  await page.getByRole("heading", { name: "Проекты" }).first().waitFor();
  await wait(1000);

  for (const [name, heading] of SETTINGS_SECTIONS) {
    await step(name, async () => {
      // Заголовок «Локальная синхронизация» — не heading, а обычный span,
      // поэтому по роли он не находится.
      const byRole = page.getByRole("heading", { name: heading }).first();
      const title = (await byRole.count())
        ? byRole
        : page.getByText(heading, { exact: true }).first();
      await title.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await shot(device, name, { settle: 800 });
    });
  }

  await step("35-field-visibility", async () => {
    const button = page.getByRole("button", { name: "Настроить поля" }).first();
    await button.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await button.click();
    await page.getByRole("heading", { name: "Настройка полей" }).waitFor();
    await shot(device, "35-field-visibility", { settle: 900 });
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .first()
      .click();
    await wait(700);
  });

  // Экспорт на Android кладёт архив в общие Документы, а не в загрузки
  // браузера — уведомление об этом и есть отличие от веб-версии.
  await step("36-export-zip", async () => {
    const exportButton = page.getByRole("button", { name: "Экспорт ZIP" });
    await exportButton.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await exportButton.click();
    // Уведомление живёт три секунды, поэтому его ждут, а не пережидают.
    await page.getByText(/сохранён в Документы/).waitFor({ timeout: 120000 });
    await shot(device, "36-export-zip", { settle: 250 });
  });
}

// --- 9. Тема и язык --------------------------------------------------------

async function themeAndLanguage(device, page) {
  console.log("\n[9] Тема и язык");
  await step("37-dark-theme", async () => {
    const toggle = page.getByRole("button", { name: "Переключить тему" });
    await toggle.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await toggle.click();
    await wait(800);
    await page
      .getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ })
      .click();
    await wait(1000);
    await openTab(page, /Главная|Home/);
    await wait(1500);
    await shot(device, "37-dark-theme", { settle: 1500 });
  });

  await step("38-english", async () => {
    await page.getByTitle(/Настройки|Settings/).click();
    await wait(1000);
    const language = page.getByRole("button", {
      name: /Переключить язык|Toggle language/,
    });
    await language.waitFor({ timeout: 20000 });
    await language.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await language.click();
    await wait(1000);
    await page
      .getByRole("button", { name: /^(?:←\s*)?(?:Назад|Back)$/ })
      .click();
    await wait(1000);
    await openTab(page, /Главная|Home/);
    await wait(1500);
    await shot(device, "38-english", { settle: 1200 });
  });
}

await main();
