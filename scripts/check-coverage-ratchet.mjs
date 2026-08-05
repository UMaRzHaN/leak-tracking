import { readFileSync } from "node:fs";

const summary = JSON.parse(
  readFileSync("coverage/coverage-summary.json", "utf8"),
);
// The same file drives `coverage.thresholds` in vite.config.mjs. Vitest fails
// the run that produces the summary; this re-checks the summary that was
// actually written, so a misconfigured reporter cannot let a regression pass.
const policy = JSON.parse(readFileSync("scripts/coverage-policy.json", "utf8"));
const metrics = ["statements", "branches", "functions", "lines"];
const failures = [];

for (const metric of metrics) {
  const actual = Number(summary.total?.[metric]?.pct);
  const minimum = Number(policy.global[metric]);
  if (!Number.isFinite(actual) || actual < minimum) {
    failures.push(`total ${metric}: ${actual}% < ${minimum}%`);
  }
}

for (const [suffix, thresholds] of Object.entries(policy.files)) {
  const entry = Object.entries(summary).find(([filePath]) =>
    filePath.replaceAll("\\", "/").endsWith(suffix),
  )?.[1];
  if (!entry) {
    failures.push(`${suffix}: coverage entry is missing`);
    continue;
  }
  for (const metric of metrics) {
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
