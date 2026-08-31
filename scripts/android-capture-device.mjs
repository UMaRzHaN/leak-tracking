/**
 * android-capture-device.mjs
 *
 * Работа с устройством для съёмки руководства: ожидание, координаты,
 * подключение к WebView и приведение снятых кадров к виду, в котором они
 * лежат в репозитории.
 *
 * Отдельно от сценария съёмки: там написано, ЧТО снимают — экран за экраном,
 * — а здесь то, КАК снимают, и это не меняется от того, какие экраны в
 * руководстве. Разделено, когда сценарий перерос бюджет сопровождаемости.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { encodePngFilesToWebp } from "./image-encoder.mjs";
import { freezeClock } from "./manual-capture-time.mjs";

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Эмулятору координаты передаются через консоль, а не через adb shell; на
// реальном устройстве команда просто не выполнится, и это не ошибка.
export function sendEmulatorLocation(device, geo) {
  try {
    execFileSync("adb", [
      "-s",
      device.serial(),
      "emu",
      "geo",
      "fix",
      String(geo.lng),
      String(geo.lat),
    ]);
  } catch {
    console.log(
      "  (координаты эмулятора не заданы — вероятно, это устройство)",
    );
  }
}

export async function openWebView(device, pkg) {
  const webview = await device.webView({ pkg });
  const page = await webview.page();
  page.setDefaultTimeout(20000);
  await freezeClock(page);
  activePage = page;
  return page;
}

let activePage = null;

// Экранная клавиатура закрывает нижнюю половину кадра, а поднимается она от
// любого заполнения поля — поэтому фокус снимается перед каждым снимком.
export async function hideKeyboard() {
  await activePage
    ?.evaluate(() =>
      /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.(),
    )
    .catch(() => {});
  await wait(700);
}

// Кадры устройства весят по полтора мегабайта — для PDF это лишнее.
export async function resizeStoredShots(outDir, storedWidth) {
  const files = (await fs.readdir(outDir)).filter((name) =>
    name.endsWith(".png"),
  );
  for (const file of files) {
    execFileSync("sips", [
      "--resampleWidth",
      String(storedWidth),
      path.join(outDir, file),
    ]);
  }
  console.log(`Кадры уменьшены до ${storedWidth} px по ширине`);
}

// PNG с экрана весит впятеро больше того же кадра в WebP, а руководство
// переснимают целиком: раз в несколько месяцев это два десятка мегабайт,
// которые остаются в истории навсегда. Кодировщик — тот же Chromium, что
// уже открыт ради съёмки; ставить ничего не нужно.
export async function storeShotsAsWebp(outDir) {
  const dir = await fs.readdir(outDir);
  const pngs = dir
    .filter((name) => name.endsWith(".png"))
    .map((name) => path.join(outDir, name));
  if (pngs.length === 0) return;

  const kb = (bytes) => Math.round(bytes / 1024);
  const { before, after } = await encodePngFilesToWebp(pngs);
  await Promise.all(pngs.map((file) => fs.rm(file, { force: true })));
  console.log(`Кадры пересжаты в WebP: ${kb(before)} КБ → ${kb(after)} КБ`);
}
