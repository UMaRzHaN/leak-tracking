import { existsSync } from "node:fs";

const required = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

const missing = required.filter(
  (name) => !String(process.env[name] ?? "").trim(),
);
if (missing.length > 0) {
  console.error(
    `Android release signing is not configured. Missing: ${missing.join(", ")}`,
  );
  process.exit(1);
}

if (!existsSync(process.env.ANDROID_KEYSTORE_PATH)) {
  console.error(
    `Android keystore was not found: ${process.env.ANDROID_KEYSTORE_PATH}`,
  );
  process.exit(1);
}
