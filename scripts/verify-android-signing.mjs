import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REQUIRED = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  "ANDROID_VERSION_CODE",
  "ANDROID_VERSION_NAME",
];

export function validateAndroidReleaseEnvironment(
  env = process.env,
  { fileExists = existsSync } = {},
) {
  const missing = REQUIRED.filter((name) => !String(env[name] ?? "").trim());
  if (missing.length > 0) {
    return `Android release is not configured. Missing: ${missing.join(", ")}`;
  }

  const versionCode = String(env.ANDROID_VERSION_CODE).trim();
  if (!/^[1-9]\d*$/.test(versionCode) || Number(versionCode) > 2_100_000_000) {
    return "ANDROID_VERSION_CODE must be a positive integer not greater than 2100000000";
  }

  const versionName = String(env.ANDROID_VERSION_NAME).trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,99}$/.test(versionName)) {
    return "ANDROID_VERSION_NAME must be 1-100 safe version characters";
  }

  if (!fileExists(env.ANDROID_KEYSTORE_PATH)) {
    return `Android keystore was not found: ${env.ANDROID_KEYSTORE_PATH}`;
  }

  return null;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const error = validateAndroidReleaseEnvironment();
  if (error) {
    console.error(error);
    process.exit(1);
  }
}
