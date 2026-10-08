// Runs after `assembleRelease` and checks the APK it produced, not the
// environment it was produced from.
//
// `verify-android-signing.mjs` only proves that a keystore file exists. Which
// key Gradle actually signed with is decided by the path and alias in the
// environment, and a wrong one is not an error: the build succeeds and yields
// an APK that refuses to install over the copies in the field
// (INSTALL_FAILED_UPDATE_INCOMPATIBLE). The certificate is therefore read back
// from the APK with `apksigner` and compared with the expected fingerprint.
//
// The R8 mapping is copied next to the APK for the same reason the APK is
// hashed: crash reports from that exact build are unreadable without it, and
// `android/app/build/outputs/mapping` is overwritten by the next release build.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const APK_DIR = "android/app/build/outputs/apk/release";
export const MAPPING_SOURCE =
  "android/app/build/outputs/mapping/release/mapping.txt";
export const MAPPING_TARGET = `${APK_DIR}/mapping.txt`;

/**
 * Accepts the fingerprint as keytool prints it (`B5:6E:…`) or as apksigner
 * prints it (`b56e…`); returns lowercase hex or null when it is not SHA-256.
 *
 * @param {string | undefined | null} value
 * @returns {string | null}
 */
export function normalizeCertDigest(value) {
  const hex = String(value ?? "")
    .replace(/[\s:]/g, "")
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/**
 * Signers are printed as `Signer #1 …` or, for SDK-ranged v3.1 signers, as
 * `Signer (minSdkVersion=…) …`; both are checked. Lineage entries (older keys
 * a rotated key vouches for) are not signers of this APK and are skipped.
 *
 * @param {string} output `apksigner verify --print-certs` stdout
 * @returns {string[]} SHA-256 digests of every signer certificate
 */
export function parseSignerDigests(output) {
  return [
    ...output.matchAll(
      /^Signer (?:#\d+|\([^)]*\)) certificate SHA-256 digest:\s*([0-9a-fA-F:]+)\s*$/gm,
    ),
  ]
    .map((match) => normalizeCertDigest(match[1]))
    .filter((digest) => digest !== null);
}

/**
 * @param {string} output
 * @param {string | undefined} expectedRaw
 * @returns {string | null} error message, or null when every signer matches
 */
export function checkSignerDigests(output, expectedRaw) {
  if (!String(expectedRaw ?? "").trim()) {
    return "ANDROID_SIGNING_CERT_SHA256 is not set: put the release certificate SHA-256 fingerprint there (README, «Подпись релиза»)";
  }
  const expected = normalizeCertDigest(expectedRaw);
  if (!expected) {
    return "ANDROID_SIGNING_CERT_SHA256 must be a SHA-256 fingerprint: 64 hex digits, colons allowed";
  }
  const digests = parseSignerDigests(output);
  if (digests.length === 0) {
    return "apksigner printed no signer certificate: the APK is unsigned";
  }
  const foreign = digests.filter((digest) => digest !== expected);
  if (foreign.length > 0) {
    return `APK is signed with an unexpected certificate: ${foreign.join(", ")} (expected ${expected})`;
  }
  return null;
}

/**
 * @param {string[]} names files in the release APK directory
 * @returns {string} the single APK name
 */
export function pickReleaseApk(names) {
  const apks = names.filter((name) => name.endsWith(".apk"));
  if (apks.length !== 1) {
    throw new Error(
      `Expected exactly one APK in ${APK_DIR}, found ${apks.length}: ${apks.join(", ") || "none"}`,
    );
  }
  return apks[0];
}

function sdkDirFromLocalProperties(root) {
  const file = path.join(root, "android/local.properties");
  if (!existsSync(file)) return null;
  const match = readFileSync(file, "utf8").match(/^sdk\.dir=(.+)$/m);
  return match ? match[1].trim().replace(/\\:/g, ":") : null;
}

function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * `APKSIGNER` wins; otherwise the newest build-tools of the SDK in
 * ANDROID_HOME, ANDROID_SDK_ROOT or android/local.properties; otherwise PATH.
 */
export function findApksigner(root = process.cwd(), env = process.env) {
  if (env.APKSIGNER) return env.APKSIGNER;
  const binary = process.platform === "win32" ? "apksigner.bat" : "apksigner";
  for (const sdk of [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    sdkDirFromLocalProperties(root),
  ]) {
    if (!sdk) continue;
    const buildTools = path.join(sdk, "build-tools");
    if (!existsSync(buildTools)) continue;
    const versions = readdirSync(buildTools)
      .filter((name) => /^\d/.test(name))
      .sort(compareVersions)
      .reverse();
    for (const version of versions) {
      const candidate = path.join(buildTools, version, binary);
      if (existsSync(candidate)) return candidate;
    }
  }
  return binary;
}

function main() {
  const root = process.cwd();
  const apkDir = path.join(root, APK_DIR);
  if (!existsSync(apkDir)) {
    throw new Error(`${APK_DIR} does not exist: run assembleRelease first`);
  }
  const apk = path.join(apkDir, pickReleaseApk(readdirSync(apkDir)));

  const apksigner = findApksigner(root);
  const result = spawnSync(apksigner, ["verify", "--print-certs", apk], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw new Error(
      `Could not run ${apksigner}: ${result.error.message}. Set ANDROID_HOME or APKSIGNER`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `apksigner rejected ${path.relative(root, apk)}:\n${result.stderr || result.stdout}`,
    );
  }
  const error = checkSignerDigests(
    result.stdout,
    process.env.ANDROID_SIGNING_CERT_SHA256,
  );
  if (error) throw new Error(error);
  console.log(
    `${path.relative(root, apk)}: signature matches the release certificate`,
  );

  const mapping = path.join(root, MAPPING_SOURCE);
  if (!existsSync(mapping)) {
    throw new Error(
      `${MAPPING_SOURCE} is missing: release builds are minified and must ship their R8 mapping`,
    );
  }
  copyFileSync(mapping, path.join(root, MAPPING_TARGET));
  console.log(`${MAPPING_TARGET}: R8 mapping saved next to the APK`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
