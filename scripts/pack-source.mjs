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
    execFileSync("npm", ["run", "lint"], {
      cwd: verificationDir,
      stdio: "inherit",
    });
  } finally {
    rmSync(verificationDir, { recursive: true, force: true });
  }
}

console.log(outputPath);
