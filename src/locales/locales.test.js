import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { translation as en } from "@/locales/en";
import { translation as ru } from "@/locales/ru";

const LANGUAGES = { ru, en };

// Empty on purpose: every English key now has a Russian counterpart. Hints
// moved once measurement showed all 25 identical across the three project
// configs; placeholders followed, with a `_<projectType>` suffix for the three
// that genuinely differ. Kept as a mechanism so a new call-site string has
// somewhere to be declared — and so the test below fails if it is declared and
// then quietly forgotten. `*` matches one key segment. This list may only
// shrink.
const RUSSIAN_STRINGS_STILL_AT_CALL_SITES = [];

function flattenKeys(node, prefix = "") {
  return Object.entries(node)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === "object" && !Array.isArray(value)
        ? flattenKeys(value, path)
        : [path];
    })
    .sort();
}

const gapMatchers = RUSSIAN_STRINGS_STILL_AT_CALL_SITES.map(
  (pattern) =>
    new RegExp(
      `^${pattern
        .split(".")
        .map((part) => (part === "*" ? "[^.]+" : part.replace(/\W/g, "\\$&")))
        .join("\\.")}$`,
    ),
);

const isKnownGap = (key) => gapMatchers.some((matcher) => matcher.test(key));

describe("locales", () => {
  // i18next falls back to Russian, so a key missing from English resolves to
  // Russian text rather than failing. Nothing surfaces that at runtime — an
  // English user simply sees Russian — which is how an entire namespace once
  // sat outside the resource tree unnoticed. This test is what notices.
  it("defines the same keys in every language", () => {
    const [[, reference], ...others] = Object.entries(LANGUAGES);
    const referenceKeys = flattenKeys(reference);

    for (const [language, translation] of others) {
      const keys = flattenKeys(translation);
      expect({
        language,
        missing: referenceKeys.filter(
          (key) => !keys.includes(key) && !isKnownGap(key),
        ),
        extra: keys.filter(
          (key) => !referenceKeys.includes(key) && !isKnownGap(key),
        ),
      }).toEqual({ language, missing: [], extra: [] });
    }
  });

  // Guards the allowlist itself: once those strings move into the locales,
  // the entry has to go, or it would keep hiding a real gap behind it.
  it("still needs every entry in the known-gap list", () => {
    const russianKeys = flattenKeys(ru);
    const stillMissing = RUSSIAN_STRINGS_STILL_AT_CALL_SITES.filter(
      (_, index) => !russianKeys.some((key) => gapMatchers[index].test(key)),
    );
    expect(stillMissing).toEqual(RUSSIAN_STRINGS_STILL_AT_CALL_SITES);
  });

  // The parity test above only compares the two locales to each other; both
  // can agree that a key does not exist. `t("x.y", { defaultValue: "…" })`
  // then renders that default in every language, which is how a handful of
  // screens showed English to a Russian reader while every test passed.
  //
  // Only literal keys are checked. A key built from a template — the field
  // labels, the status names — is covered by the screen's own test resolving
  // against the real locale.
  it("defines every literal key the code asks for", () => {
    const known = new Set(flattenKeys(ru));
    const files = execSync(
      `grep -rl 't("' src/ | grep -v '\\.test\\.' | grep -v '/locales/'`,
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");

    const missing = new Set();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const [, key] of source.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*)"/g)) {
        if (!known.has(key)) missing.add(`${key}  (${file})`);
      }
    }

    expect([...missing].sort()).toEqual([]);
  });

  it("leaves no value empty", () => {
    for (const [language, translation] of Object.entries(LANGUAGES)) {
      const blank = flattenKeys(translation).filter((key) => {
        const value = key
          .split(".")
          .reduce((node, part) => node?.[part], translation);
        return typeof value === "string" && value.trim() === "";
      });
      expect({ language, blank }).toEqual({ language, blank: [] });
    }
  });
});
