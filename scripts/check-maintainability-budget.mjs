import { readFileSync } from "node:fs";

const policy = JSON.parse(
  readFileSync("scripts/maintainability-budget.json", "utf8"),
);
const failures = [];

for (const [filePath, maximumLines] of Object.entries(policy.files)) {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
  if (lines > maximumLines) {
    failures.push(`${filePath}: ${lines} lines > ${maximumLines}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Maintainability budget failed:\n${failures.join("\n")}`);
}
console.log("Maintainability budget passed");
