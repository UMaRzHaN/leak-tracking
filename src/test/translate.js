import { translation as en } from "@/locales/en";
import { translation as ru } from "@/locales/ru";

function resolve(translation, key, options) {
  const value = String(key)
    .split(".")
    .reduce((node, part) => node?.[part], translation);

  if (typeof value !== "string") return options?.defaultValue ?? key;

  return value.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    options && name in options ? String(options[name]) : match,
  );
}

/**
 * A `t` for tests that resolves against the real English locale.
 *
 * Tests used to stub this with `(key, options) => options?.defaultValue ?? key`,
 * which asserts nothing about the translations themselves — a screen could lose
 * its strings entirely and every test would still pass. That is how an English
 * namespace once sat outside the resource tree unnoticed. Resolving for real
 * means these tests fail when a key is missing.
 *
 * Falls back to `defaultValue` for keys whose Russian text still lives at the
 * call site, which is the state the wider i18n migration is working through.
 */
export function translate(key, options) {
  return resolve(en, key, options);
}

/** The same against the Russian locale, for code that has to work in both. */
export function translateRu(key, options) {
  return resolve(ru, key, options);
}

/** The shape `vi.mock("@/app/hooks/useLanguage", …)` needs, in English. */
export function englishLanguageHook() {
  return {
    useLanguage: () => ({
      lang: "en",
      t: translate,
      intlLocale: "en-US",
      speechLocale: "en-US",
      toggleLanguage: () => {},
      setLanguage: () => {},
    }),
  };
}
