#!/usr/bin/env node
/**
 * Applies small compatibility fixes that upstream Capacitor plugins have not
 * released yet. This runs after npm install and after every `cap sync`.
 */

const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

function patchFile(relativePath, transform) {
  const file = resolve(relativePath);
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    console.log(`[patch-gradle] ${relativePath} is not present; skipped.`);
    return;
  }

  const patched = transform(content);
  if (patched === content) {
    console.log(`[patch-gradle] ${relativePath} is already compatible.`);
    return;
  }
  writeFileSync(file, patched, "utf8");
  console.log(`[patch-gradle] Patched ${relativePath}.`);
}

patchFile("android/capacitor-cordova-android-plugins/build.gradle", (content) =>
  content.replace(/\s*flatDir\s*\{[^}]*\}\n?/g, ""),
);

patchFile(
  "node_modules/@capacitor-community/speech-recognition/android/build.gradle",
  (content) =>
    content
      .replace(/^(\s*)namespace\s+(["'][^"']+["'])/m, "$1namespace = $2")
      .replace(/^(\s*)abortOnError\s+false/m, "$1abortOnError = false"),
);
