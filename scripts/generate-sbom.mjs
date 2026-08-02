import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outputDir = path.resolve(".artifacts");
const outputPath = path.join(outputDir, "sbom.cdx.json");
mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  "npm",
  [
    "sbom",
    "--package-lock-only",
    "--sbom-format",
    "cyclonedx",
    "--sbom-type",
    "application",
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  throw new Error(result.stderr || "Unable to generate SBOM");
}
writeFileSync(outputPath, result.stdout);
console.log(outputPath);
