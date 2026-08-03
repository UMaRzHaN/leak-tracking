import { describe, expect, it } from "vitest";
import { translation as en } from "@/locales/en";
import { translation as ru } from "@/locales/ru";

const LANGUAGES = { ru, en };

// Keys that legitimately exist in one language only, because they name the
// *other* language: the Russian UI offers a switch to English and vice versa.
const CROSS_LANGUAGE_KEYS = [
  "settings.languageHintEn",
  "settings.languageHintRu",
  "settings.toggleButtonEn",
  "settings.toggleButtonRu",
];

// Keys English defines and Russian does not, because those Russian strings
// still live in `defaultValue` arguments at the call sites rather than here.
// Moving them is part of the wider i18n migration; until then they are listed
// so that the parity check still catches anything new. This list may only
// shrink.
const RUSSIAN_STRINGS_STILL_AT_CALL_SITES = [
  "addLeak.fields",
  "addLeak.stepTitles",
];

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

const isKnownGap = (key) =>
  CROSS_LANGUAGE_KEYS.includes(key) ||
  RUSSIAN_STRINGS_STILL_AT_CALL_SITES.some((prefix) =>
    key.startsWith(`${prefix}.`),
  );

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
      (prefix) => !russianKeys.some((key) => key.startsWith(`${prefix}.`)),
    );
    expect(stillMissing).toEqual(RUSSIAN_STRINGS_STILL_AT_CALL_SITES);
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
