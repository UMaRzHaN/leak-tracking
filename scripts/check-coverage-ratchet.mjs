import { readFileSync } from "node:fs";

const summary = JSON.parse(
  readFileSync("coverage/coverage-summary.json", "utf8"),
);
const policy = JSON.parse(
  readFileSync("scripts/coverage-ratchet.json", "utf8"),
);
const failures = [];

for (const [suffix, thresholds] of Object.entries(policy.files)) {
  const entry = Object.entries(summary).find(([filePath]) =>
    filePath.replaceAll("\\", "/").endsWith(suffix),
  )?.[1];
  if (!entry) {
    failures.push(`${suffix}: coverage entry is missing`);
    continue;
  }
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    const actual = Number(entry[metric]?.pct);
    const minimum = Number(thresholds[metric]);
    if (!Number.isFinite(actual) || actual < minimum) {
      failures.push(`${suffix} ${metric}: ${actual}% < ${minimum}%`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Coverage ratchet failed:\n${failures.join("\n")}`);
}
console.log("Coverage ratchet passed");
