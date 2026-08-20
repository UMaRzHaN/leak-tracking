/**
 * image-encoder.mjs
 *
 * Пересжимает снимки экрана в WebP, ничего не устанавливая: кодировщик берётся
 * у Chromium, который уже стоит ради Playwright и которым печатается PDF
 * руководства. Внешних инструментов (pngquant, sharp, cwebp) в проекте нет, и
 * заводить их ради картинок в документации — дороже задачи.
 *
 * Снимок интерфейса — плоские заливки и текст; на качестве 0.92 разницы не
 * видно, а вес падает вчетверо-впятеро. Это важнее, чем кажется: каждая
 * пересъёмка руководства добавляла в историю по два десятка мегабайт.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_QUALITY = 0.92;

/**
 * @param {string[]} files пути к png
 * @param {{quality?: number, onFile?: (info: {file: string, before: number, after: number}) => void}} [options]
 * @returns {Promise<{before: number, after: number, written: string[]}>}
 */
export async function encodePngFilesToWebp(files, options = {}) {
  const quality = options.quality ?? DEFAULT_QUALITY;
  if (files.length === 0) return { before: 0, after: 0, written: [] };

  const browser = await chromium.launch();
  const page = await browser.newPage();
  let before = 0;
  let after = 0;
  const written = [];

  try {
    for (const file of files) {
      const source = await fs.readFile(file);
      const encoded = await page.evaluate(
        async ({ base64, quality }) => {
          const blob = await (
            await fetch(`data:image/png;base64,${base64}`)
          ).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          const out = await canvas.convertToBlob({
            type: "image/webp",
            quality,
          });
          const buffer = await out.arrayBuffer();
          let binary = "";
          for (const byte of new Uint8Array(buffer)) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        },
        { base64: source.toString("base64"), quality },
      );

      const target = file.replace(/\.png$/i, ".webp");
      const output = Buffer.from(encoded, "base64");
      // Кодировщик мог бы и проиграть — на крошечных иконках это бывает.
      if (output.length >= source.length) continue;
      await fs.writeFile(target, output);
      before += source.length;
      after += output.length;
      written.push(target);
      options.onFile?.({ file, before: source.length, after: output.length });
    }
  } finally {
    await browser.close();
  }

  return { before, after, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    throw new Error("Usage: node scripts/image-encoder.mjs <dir> [dir...]");
  }
  const files = [];
  for (const dir of dirs) {
    for (const name of (await fs.readdir(dir)).sort()) {
      if (name.toLowerCase().endsWith(".png")) files.push(path.join(dir, name));
    }
  }
  const kb = (bytes) => `${Math.round(bytes / 1024)} КБ`;
  const result = await encodePngFilesToWebp(files, {
    onFile: ({ file, before, after }) =>
      console.log(`${path.basename(file)}: ${kb(before)} → ${kb(after)}`),
  });
  console.log(
    `\nвсего ${result.written.length} файлов: ${kb(result.before)} → ${kb(result.after)}`,
  );
}
