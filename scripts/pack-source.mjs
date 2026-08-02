import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const verify = process.argv.includes("--verify");
const status = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (status.trim()) {
  throw new Error(
    "Source archive requires a clean worktree so no local changes are omitted",
  );
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const outputDir = path.resolve(".artifacts");
const outputPath = path.join(
  outputDir,
  `leak-tracking-source-${packageJson.version}.zip`,
);
mkdirSync(outputDir, { recursive: true });
execFileSync(
  "git",
  ["archive", "--format=zip", `--output=${outputPath}`, "HEAD"],
  { stdio: "inherit" },
);

const archiveEntries = execFileSync("unzip", ["-Z1", outputPath], {
  encoding: "utf8",
})
  .split("\n")
  .map((entry) => entry.trim())
  .filter(Boolean);
const forbiddenArchiveEntries = archiveEntries.filter((entry) =>
  [
    "node_modules/",
    ".git/",
    "design/",
    "outputs/",
    "dist/",
    "coverage/",
    ".artifacts/",
    "playwright-report/",
    "test-results/",
    "__MACOSX/",
  ].some((prefix) => entry.startsWith(prefix)),
);
const macMetadataEntries = archiveEntries.filter(
  (entry) => entry === ".DS_Store" || entry.endsWith("/.DS_Store"),
);
if (forbiddenArchiveEntries.length > 0 || macMetadataEntries.length > 0) {
  throw new Error(
    `Source archive contains forbidden entries: ${[
      ...forbiddenArchiveEntries,
      ...macMetadataEntries,
    ]
      .slice(0, 20)
      .join(", ")}`,
  );
}

if (verify) {
  const verificationDir = mkdtempSync(
    path.join(tmpdir(), "leak-tracking-source-verify-"),
  );
  try {
    execFileSync("unzip", ["-q", outputPath, "-d", verificationDir], {
      stdio: "inherit",
    });
    execFileSync("npm", ["ci", "--ignore-scripts"], {
      cwd: verificationDir,
      stdio: "inherit",
    });
    for (const script of [
      "lint",
      "format:check",
      "typecheck",
      "test",
      "build",
    ]) {
      execFileSync("npm", ["run", script], {
        cwd: verificationDir,
        stdio: "inherit",
      });
    }
  } finally {
    rmSync(verificationDir, { recursive: true, force: true });
  }
}

console.log(outputPath);
