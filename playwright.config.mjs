import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "offline.spec.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Сохранение ждёт координаты до пятнадцати секунд (см. COORDS_WAIT_MS):
    // запись без них выпадает с карты, поэтому приёмник включается и ему
    // дают время. В браузере без разрешения этот срок выходит целиком на
    // каждой утечке. Фикс выдаётся сразу — так проверяется тот же путь, что
    // и у человека с работающим GPS, а не путь ожидания.
    geolocation: { latitude: 41.311081, longitude: 69.240562 },
    permissions: ["geolocation"],
    // Тема без сохранённого выбора идёт за системной настройкой, а у неё в
    // Playwright есть значение по умолчанию, которое здесь не видно. Смоук
    // жмёт переключатель один раз и ждёт тёмную — значит, отправная точка
    // должна быть светлой не по совпадению, а по договорённости.
    colorScheme: "light",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
