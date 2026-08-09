// Guards the Capacitor runtime against R8.
//
// Capacitor resolves plugins, their methods and their permission declarations
// reflectively. R8 sees no caller for that metadata, so it is free to rename or
// delete it, and when it does the failure is silent at build time and fatal at
// run time: deleting `PluginHandle.pluginAnnotation` left `getPluginAnnotation()`
// folded to null, `Bridge.getPermissionStates` dereferenced it, and every plugin
// that checks a permission died the moment it was called. Camera and geolocation
// crashed on tap, in release builds only.
//
// Nothing else catches this. Instrumented tests run on the debug variant, which
// never goes through R8, so the whole gate suite passed on a build that could not
// take a photo. R8 writes down what it did, so this reads that record instead of
// needing a device.
//
// Inputs are the mapping and usage reports from a release build:
//   android/app/build/outputs/mapping/release/{mapping,usage}.txt

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAPPING_DIR = "android/app/build/outputs/mapping/release";

// Renaming these breaks nothing on its own — R8 rewrites class literals
// consistently — but keeping them readable is what makes a stripped annotation
// obvious in a crash report rather than a puzzle of one-letter names.
const CLASSES_KEPT_BY_NAME = [
  "com.getcapacitor.Bridge",
  "com.getcapacitor.PluginHandle",
  "com.getcapacitor.annotation.CapacitorPlugin",
  "com.getcapacitor.annotation.Permission",
  "com.getcapacitor.annotation.PermissionCallback",
  "com.getcapacitor.annotation.ActivityCallback",
];

// The exact member whose removal caused the crash, plus the legacy field beside
// it that fails the same way for plugins still on the v2 annotation.
const MEMBERS_THAT_MUST_SURVIVE = [
  { owner: "com.getcapacitor.PluginHandle", member: "pluginAnnotation" },
  { owner: "com.getcapacitor.PluginHandle", member: "legacyPluginAnnotation" },
];

export function parseRemovedMembers(usageReport) {
  const removed = new Map();
  let currentClass = null;

  for (const rawLine of usageReport.split("\n")) {
    if (!rawLine.trim()) continue;

    // A class line has no leading whitespace and ends in a colon; its removed
    // members are the indented lines that follow.
    if (!/^\s/.test(rawLine)) {
      currentClass = rawLine.endsWith(":") ? rawLine.slice(0, -1) : null;
      continue;
    }

    if (currentClass) {
      const existing = removed.get(currentClass) ?? [];
      existing.push(rawLine.trim());
      removed.set(currentClass, existing);
    }
  }

  return removed;
}

export function parseKeptClassNames(mappingReport) {
  const kept = new Map();

  for (const rawLine of mappingReport.split("\n")) {
    // Class lines are unindented and read `original -> obfuscated:`.
    if (/^\s/.test(rawLine)) continue;
    const match = rawLine.match(/^([\w.$]+) -> ([\w.$]+):$/);
    if (match) kept.set(match[1], match[2]);
  }

  return kept;
}

export function checkAndroidR8Keeps({ mappingReport, usageReport }) {
  const problems = [];
  const kept = parseKeptClassNames(mappingReport);
  const removed = parseRemovedMembers(usageReport);

  for (const className of CLASSES_KEPT_BY_NAME) {
    const obfuscated = kept.get(className);

    if (obfuscated === undefined) {
      problems.push(
        `${className} is absent from mapping.txt — R8 removed it entirely. ` +
          `Capacitor looks it up reflectively, so the app will fail at run time.`,
      );
      continue;
    }

    if (obfuscated !== className) {
      problems.push(
        `${className} was renamed to ${obfuscated}. Add a keep rule in ` +
          `android/app/proguard-rules.pro so release crash reports stay readable.`,
      );
    }
  }

  for (const { owner, member } of MEMBERS_THAT_MUST_SURVIVE) {
    const removedFromOwner = removed.get(owner) ?? [];
    const hit = removedFromOwner.find((entry) => entry.includes(member));

    if (hit) {
      problems.push(
        `R8 removed ${owner}.${member} (usage.txt: "${hit}"). ` +
          `getPluginAnnotation() then folds to null and ` +
          `Bridge.getPermissionStates throws NullPointerException, so every ` +
          `plugin that checks a permission crashes when it is called.`,
      );
    }
  }

  return problems;
}

function readReport(name) {
  const path = `${MAPPING_DIR}/${name}`;
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mappingReport = readReport("mapping.txt");
  const usageReport = readReport("usage.txt");

  if (mappingReport === null || usageReport === null) {
    console.error(
      `No R8 reports under ${MAPPING_DIR}. Build the release variant first:\n` +
        `  cd android && ./gradlew :app:assembleRelease`,
    );
    process.exit(1);
  }

  const problems = checkAndroidR8Keeps({ mappingReport, usageReport });

  if (problems.length > 0) {
    console.error("R8 stripped Capacitor runtime metadata:\n");
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
  }

  console.log("Capacitor runtime survived R8");
}
