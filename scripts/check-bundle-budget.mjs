import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DIST = path.resolve("dist");
const ASSETS = path.join(DIST, "assets");
const budgets = {
  initialRawBytes: 360 * 1024,
  initialGzipBytes: 115 * 1024,
  nonExcelChunkBytes: 360 * 1024,
  excelChunkBytes: 1_000 * 1024,
  totalJsBytes: 3_100 * 1024,
};

const html = await readFile(path.join(DIST, "index.html"), "utf8");
const initialFiles = [
  ...html.matchAll(/(?:src|href)="\/(assets\/[^"?]+\.(?:js|css))"/g),
].map((match) => match[1]);
const assetNames = await readdir(ASSETS);
const jsNames = assetNames.filter((name) => name.endsWith(".js"));
const sizes = new Map();
for (const name of assetNames) {
  const filePath = path.join(ASSETS, name);
  sizes.set(`assets/${name}`, (await stat(filePath)).size);
}

const failures = [];
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

if (initialRaw > budgets.initialRawBytes)
  failures.push(`initial raw ${initialRaw} > ${budgets.initialRawBytes}`);
if (initialGzip > budgets.initialGzipBytes)
  failures.push(`initial gzip ${initialGzip} > ${budgets.initialGzipBytes}`);
if (totalJs > budgets.totalJsBytes)
  failures.push(`total JS ${totalJs} > ${budgets.totalJsBytes}`);
for (const name of jsNames) {
  const size = sizes.get(`assets/${name}`);
  const limit = /exceljs/i.test(name)
    ? budgets.excelChunkBytes
    : budgets.nonExcelChunkBytes;
  if (size > limit) failures.push(`${name} ${size} > ${limit}`);
}

console.log(
  JSON.stringify({ initialRaw, initialGzip, totalJs, budgets }, null, 2),
);
if (failures.length) {
  throw new Error(
    `Bundle performance budget exceeded:\n${failures.join("\n")}`,
  );
}
