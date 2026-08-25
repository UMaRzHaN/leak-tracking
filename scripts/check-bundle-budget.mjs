import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { isExcelVendorChunk } from "./bundle-chunk-names.mjs";

const DIST = path.resolve("dist");
const ASSETS = path.join(DIST, "assets");
// `initial*` — это первая отрисовка: то, что документ грузит, прежде чем
// что-то показать. Полный объём, который заберёт устройство, больше: сразу
// после старта сервис-воркер докладывает в кэш весь остальной граф, ради
// работы без сети. Ужимать эти числа стоит ради времени до первого экрана, а
// не ради трафика — трафик считается по totalJs.
const budgets = {
  initialRawBytes: 410 * 1024,
  initialGzipBytes: 125 * 1024,
  nonExcelChunkBytes: 360 * 1024,
  excelChunkBytes: 1_000 * 1024,
  appGraphJsBytes: 2_500 * 1024,
  // Re-baselined when the Excel worker took on import parsing in addition to
  // export: its graph gained the parser plus a JSZip copy (~97 kB), since
  // decompression moved off the main thread. Measured 1 150 190 B; this leaves
  // ~2.5% headroom. Raised because the worker's responsibility changed, not to
  // make a failing check pass — trimming what was avoidable (Capacitor, ~9 kB)
  // does not close a 24 kB gap.
  excelWorkerGraphBytes: 1_152 * 1024,
};

const html = await readFile(path.join(DIST, "index.html"), "utf8");
const initialFiles = [
  ...html.matchAll(/(?:src|href)="(?:[^"?]*\/)?(assets\/[^"?]+\.(?:js|css))"/g),
].map((match) => match[1]);
const assetNames = await readdir(ASSETS);
const jsNames = assetNames.filter((name) => name.endsWith(".js"));
const sizes = new Map();
for (const name of assetNames) {
  const filePath = path.join(ASSETS, name);
  sizes.set(`assets/${name}`, (await stat(filePath)).size);
}

const failures = [];
const warnings = [];
const eagerExcelFiles = initialFiles.filter(isExcelVendorChunk);
if (eagerExcelFiles.length) {
  failures.push(`ExcelJS must remain lazy: ${eagerExcelFiles.join(", ")}`);
}
const initialRaw = initialFiles.reduce(
  (sum, name) => sum + (sizes.get(name) ?? 0),
  0,
);
let initialGzip = 0;
for (const name of initialFiles) {
  initialGzip += gzipSync(await readFile(path.join(DIST, name))).length;
}
const totalJs = jsNames.reduce(
  (sum, name) => sum + sizes.get(`assets/${name}`),
  0,
);
const VENDOR_COPY_MIN_BYTES = 50 * 1024;
const excelWorkerFiles = jsNames.filter((name) => {
  const size = sizes.get(`assets/${name}`) ?? 0;
  return (
    // Export and import share one worker; keep the old name matching so a
    // stale build directory is still classified correctly.
    /excel(Export)?\.worker/i.test(name) ||
    // The worker decompresses archives itself, so its graph carries its own
    // copies of both vendors. Counting only ExcelJS understated it by ~97 kB
    // and inflated the app graph by the same amount. The size gate separates a
    // real vendor copy from the sub-kilobyte re-export shims Rollup emits, so
    // it has to sit below JSZip's ~97 kB rather than above it.
    ((/^exceljs\.min-/i.test(name) || /^jszip\.min-/i.test(name)) &&
      size > VENDOR_COPY_MIN_BYTES)
  );
});
const excelWorkerJs = excelWorkerFiles.reduce(
  (sum, name) => sum + sizes.get(`assets/${name}`),
  0,
);
const appGraphJs = totalJs - excelWorkerJs;

if (initialRaw > budgets.initialRawBytes)
  failures.push(`initial raw ${initialRaw} > ${budgets.initialRawBytes}`);
if (initialGzip > budgets.initialGzipBytes)
  failures.push(`initial gzip ${initialGzip} > ${budgets.initialGzipBytes}`);
if (appGraphJs > budgets.appGraphJsBytes)
  failures.push(`app graph JS ${appGraphJs} > ${budgets.appGraphJsBytes}`);
if (excelWorkerJs > budgets.excelWorkerGraphBytes)
  failures.push(
    `Excel worker graph JS ${excelWorkerJs} > ${budgets.excelWorkerGraphBytes}`,
  );
for (const [label, value, limit] of [
  ["initial raw", initialRaw, budgets.initialRawBytes],
  ["initial gzip", initialGzip, budgets.initialGzipBytes],
  ["app graph JS", appGraphJs, budgets.appGraphJsBytes],
  ["Excel worker graph JS", excelWorkerJs, budgets.excelWorkerGraphBytes],
]) {
  if (value > limit * 0.9 && value <= limit) {
    warnings.push(`${label} is above 90% of budget (${value}/${limit})`);
  }
}
for (const name of jsNames) {
  const size = sizes.get(`assets/${name}`);
  const limit = isExcelVendorChunk(name)
    ? budgets.excelChunkBytes
    : budgets.nonExcelChunkBytes;
  if (size > limit) failures.push(`${name} ${size} > ${limit}`);
}

console.log(
  JSON.stringify(
    {
      initialRaw,
      initialGzip,
      appGraphJs,
      excelWorkerJs,
      totalJs,
      excelWorkerFiles,
      budgets,
    },
    null,
    2,
  ),
);
if (warnings.length)
  console.warn(`Bundle budget warnings:\n${warnings.join("\n")}`);
if (failures.length) {
  throw new Error(
    `Bundle performance budget exceeded:\n${failures.join("\n")}`,
  );
}
