import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, ".artifacts");
const outputPath = path.join(outputDir, "SHA256SUMS");
mkdirSync(outputDir, { recursive: true });

function collect(target, output = []) {
  if (!existsSync(target)) return output;
  const stats = statSync(target);
  if (stats.isFile()) {
    if (path.resolve(target) !== path.resolve(outputPath)) output.push(target);
    return output;
  }
  for (const name of readdirSync(target))
    collect(path.join(target, name), output);
  return output;
}

const targets = process.argv.slice(2);
const roots = targets.length
  ? targets
  : [
      ".artifacts",
      "dist",
      "android/app/build/outputs/apk",
      "android/app/build/outputs/bundle",
    ];
const files = roots
  .flatMap((entry) => collect(path.resolve(entry)))
  .filter((filePath) => !filePath.endsWith(".DS_Store"))
  .sort();

const lines = files.map((filePath) => {
  const digest = createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  return `${digest}  ${relative}`;
});
writeFileSync(outputPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`);
console.log(`${outputPath} (${lines.length} files)`);
