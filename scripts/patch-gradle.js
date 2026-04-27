#!/usr/bin/env node
/**
 * Removes the deprecated flatDir block from the Capacitor-generated
 * build.gradle after every `cap sync`. Run via `npm run cap:sync`.
 */

const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const FILE = resolve("android/capacitor-cordova-android-plugins/build.gradle");

let content;
try {
  content = readFileSync(FILE, "utf8");
} catch {
  console.error("[patch-gradle] File not found:", FILE);
  process.exit(1);
}

const patched = content.replace(/\s*flatDir\s*\{[^}]*\}\n?/g, "");

if (patched === content) {
  console.log("[patch-gradle] flatDir not found — nothing to patch.");
} else {
  writeFileSync(FILE, patched, "utf8");
  console.log("[patch-gradle] Removed flatDir from", FILE);
}
