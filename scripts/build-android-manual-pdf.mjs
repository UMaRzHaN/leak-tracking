/**
 * build-android-manual-pdf.mjs
 *
 * Печатает docs/manual/android/manual.html в PDF: обложка, оглавление,
 * разделы со скриншотами с реального устройства, колонтитул с номерами
 * страниц.
 *
 *   node scripts/capture-android-manual-screenshots.mjs   # кадры
 *   node scripts/build-android-manual-pdf.mjs             # PDF
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE = path.resolve("docs/manual/android/manual.html");
const OUTPUT = path.resolve("docs/Leak-Tracker-Android-Manual.pdf");

const FOOTER = `
  <div style="width:100%;font-size:7pt;color:#8a93a5;padding:0 14mm;
              font-family:Helvetica,Arial,sans-serif;
              display:flex;justify-content:space-between;">
    <span>Leak Tracker · руководство пользователя (Android)</span>
    <span class="pageNumber"></span>
  </div>`;

async function main() {
  await fs.access(SOURCE);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const missing = [];
  page.on("requestfailed", (request) => missing.push(request.url()));

  await page.goto(pathToFileURL(SOURCE).href, { waitUntil: "networkidle" });

  // Пустая рамка вместо ненайденного скриншота прошла бы в PDF незамеченной.
  const brokenImages = await page.evaluate(() =>
    [...document.images]
      .filter((image) => !image.naturalWidth)
      .map((image) => image.getAttribute("src")),
  );
  if (brokenImages.length) {
    throw new Error(`Не найдены изображения: ${brokenImages.join(", ")}`);
  }

  await page.pdf({
    path: OUTPUT,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: FOOTER,
    margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
  });

  await browser.close();

  const { size } = await fs.stat(OUTPUT);
  const images = await page
    .evaluate(() => document.images.length)
    .catch(() => null);
  console.log(
    `PDF собран: ${path.relative(process.cwd(), OUTPUT)} · ${(
      size /
      1024 /
      1024
    ).toFixed(1)} МБ${images ? ` · изображений: ${images}` : ""}`,
  );
  if (missing.length) {
    console.log(`Не загрузилось запросов: ${missing.length}`);
  }
}

await main();
