import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DIST = path.resolve("dist");
const ASSETS = path.join(DIST, "assets");
const budgets = {
  initialRawBytes: 410 * 1024,
  initialGzipBytes: 125 * 1024,
  nonExcelChunkBytes: 360 * 1024,
  excelChunkBytes: 1_000 * 1024,
  appGraphJsBytes: 2_500 * 1024,
  excelWorkerGraphBytes: 1_100 * 1024,
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

const isExcelChunk = (name) =>
  /(?:^|[-_.])(?:vendor-)?excel(?:js)?(?:[-_.]|$)/i.test(name);

const failures = [];
const warnings = [];
const eagerExcelFiles = initialFiles.filter(isExcelChunk);
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
const excelWorkerFiles = jsNames.filter((name) => {
  const size = sizes.get(`assets/${name}`) ?? 0;
  return (
    /excelExport\.worker/i.test(name) ||
    (/^exceljs\.min-/i.test(name) && size > 100 * 1024)
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
  const limit = isExcelChunk(name)
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
