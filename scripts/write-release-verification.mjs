import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const scopeArg = process.argv.find((argument) =>
  argument.startsWith("--scope="),
);
const scope = scopeArg?.slice("--scope=".length) || "web";
const validScopes = new Set(["web", "android", "e2e", "source"]);
if (!validScopes.has(scope))
  throw new Error(`Unknown verification scope: ${scope}`);
const allowDirty = process.argv.includes("--allow-dirty");
const requireClean = !allowDirty;
const root = process.cwd();
const outputDir = path.join(root, ".artifacts");
mkdirSync(outputDir, { recursive: true });

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function collectFiles(target, output = []) {
  if (!existsSync(target)) return output;
  const stats = statSync(target);
  if (stats.isFile()) {
    output.push(target);
    return output;
  }
  for (const name of readdirSync(target)) {
    collectFiles(path.join(target, name), output);
  }
  return output;
}

function relativeArtifact(filePath) {
  return {
    path: path.relative(root, filePath).replaceAll(path.sep, "/"),
    bytes: statSync(filePath).size,
    sha256: sha256(filePath),
  };
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}
${result.stderr ?? ""}`.trim();
  return result.status === 0 ? output || null : null;
}

function androidTestSummary() {
  const files = collectFiles(
    path.join(root, "android/app/build/test-results"),
  ).filter((filePath) => filePath.endsWith(".xml"));
  const summary = { suites: 0, tests: 0, failures: 0, errors: 0, skipped: 0 };
  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    for (const key of ["tests", "failures", "errors", "skipped"]) {
      const match = source.match(new RegExp(`${key}="(\\d+)"`));
      if (match) summary[key] += Number(match[1]);
    }
    summary.suites += 1;
  }
  return files.length > 0 ? summary : null;
}

const dirtyEntries = git("status", "--porcelain", "--untracked-files=all")
  .split("\n")
  .filter(Boolean);
if (requireClean && dirtyEntries.length > 0) {
  throw new Error("Release verification requires a clean Git worktree");
}

const currentSha = git("rev-parse", "HEAD");
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== currentSha) {
  throw new Error(
    `Checked-out SHA ${currentSha} does not match GITHUB_SHA ${process.env.GITHUB_SHA}`,
  );
}

const scopePaths = {
  source: [
    "package-lock.json",
    ".artifacts/sbom.cdx.json",
    ".artifacts/licenses.json",
  ],
  web: [
    "dist",
    "coverage/coverage-summary.json",
    "package-lock.json",
    ".artifacts/sbom.cdx.json",
    ".artifacts/licenses.json",
  ],
  android: [
    // The release directory rather than the whole of `apk`. That directory
    // also holds the debug build, its instrumentation APK, and the
    // debug-signed `releaseCheck` twin — none of which are the release, and
    // the last of which is minified exactly like it and so is the easiest to
    // mistake for it. Evidence for a release should describe the release.
    "android/app/build/outputs/apk/release",
    "android/app/build/reports/lint-results-debug.html",
    "android/app/build/reports/lint-results-release.html",
    "android/app/build/test-results",
  ],
  e2e: ["playwright-report", "test-results"],
};
const sourceArchives =
  scope === "source" && existsSync(outputDir)
    ? readdirSync(outputDir)
        .filter((name) => /^leak-tracking-source-.*\.zip$/u.test(name))
        .map((name) => path.join(outputDir, name))
    : [];
const artifactFiles = [
  ...(scopePaths[scope] ?? scopePaths.web).flatMap((entry) =>
    collectFiles(path.join(root, entry)),
  ),
  ...sourceArchives,
]
  .filter((filePath) => !filePath.endsWith(".DS_Store"))
  .sort();

const payload = {
  schemaVersion: 2,
  scope,
  generatedAt: new Date().toISOString(),
  git: {
    sha: currentSha,
    shortSha: git("rev-parse", "--short", "HEAD"),
    commitTimestamp: git("show", "-s", "--format=%cI", "HEAD"),
    dirty: dirtyEntries.length > 0,
    dirtyEntries,
  },
  environment: {
    node: process.version,
    npm: commandVersion("npm", ["--version"]),
    java: commandVersion("java", ["-version"]),
    platform: process.platform,
    arch: process.arch,
    ci: Boolean(process.env.CI),
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
  },
  provenance: {
    buildType: "https://github.com/Leak-Tracking/release-verification/v1",
    builder: {
      id: process.env.GITHUB_WORKFLOW_REF ?? `local:${process.platform}`,
    },
    invocation: {
      scope,
      eventName: process.env.GITHUB_EVENT_NAME ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      ref: process.env.GITHUB_REF ?? null,
    },
    materials: [
      {
        uri: `git+${process.env.GITHUB_SERVER_URL ?? "local"}/${process.env.GITHUB_REPOSITORY ?? "repository"}@${currentSha}`,
        digest: { sha1: currentSha },
      },
      ...(existsSync(path.join(root, "package-lock.json"))
        ? [
            {
              uri: "file:package-lock.json",
              digest: {
                sha256: sha256(path.join(root, "package-lock.json")),
              },
            },
          ]
        : []),
    ],
  },
  checks: {
    completedScope: scope,
    coverage:
      scope === "web"
        ? readJson(path.join(root, "coverage/coverage-summary.json"))
        : null,
    androidTests: scope === "android" ? androidTestSummary() : null,
    playwright:
      scope === "e2e"
        ? readJson(path.join(root, "test-results/.last-run.json"))
        : null,
  },
  artifacts: artifactFiles.map(relativeArtifact),
};

const outputPath = path.join(outputDir, `release-verification-${scope}.json`);
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(outputPath);
