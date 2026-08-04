/**
 * Fetches a language's strings and registers them with a running i18next.
 *
 * Takes the instance as an argument rather than importing it. Callers on the
 * main graph — the language switch, for one — would otherwise drag i18next
 * itself out of its lazy chunk and into the entry bundle, which costs more
 * than splitting the languages saves.
 */

const DEFAULT_LANGUAGE = "ru";

// A static map, because Vite needs literal specifiers to split these into
// separate chunks.
const LOADERS = {
  ru: () => import("@/locales/ru"),
  en: () => import("@/locales/en"),
};

export const SUPPORTED_LANGUAGES = Object.keys(LOADERS);

const loaded = new Set();

/**
 * Resolves to the language that is usable afterwards: an unknown one, or a
 * chunk that fails to arrive, falls back to the default rather than leaving
 * the interface showing raw keys.
 */
export async function loadLanguage(i18n, language) {
  if (loaded.has(language)) return language;

  const load = LOADERS[language];
  if (!load) {
    return language === DEFAULT_LANGUAGE
      ? language
      : loadLanguage(i18n, DEFAULT_LANGUAGE);
  }

  try {
    const { translation } = await load();
    i18n.addResourceBundle(language, "translation", translation, true, true);
    loaded.add(language);
    return language;
  } catch {
    return language === DEFAULT_LANGUAGE
      ? language
      : loadLanguage(i18n, DEFAULT_LANGUAGE);
  }
}
