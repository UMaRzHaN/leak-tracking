import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadLanguage } from "@/locales/loadLanguage";
import { getStorageItem } from "@/utils/safeStorage";

const LANGUAGE_STORAGE_KEY = "app_language";
const DEFAULT_LANGUAGE = "ru";

const savedLanguage = getStorageItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE);

const initialized = i18n.use(initReactI18next).init({
  // Filled in by loadLanguage: only the language being read is fetched, and
  // this runs before the first render, so bundling every language would put
  // the whole set on the critical path.
  resources: {},
  lng: savedLanguage,
  // Deliberately no fallback language. With one language loaded there is
  // nothing to fall back to, and a missing key showing its own name is a
  // visible failure — where falling back to Russian would quietly show
  // Russian to an English reader, the fault the locale parity test exists to
  // prevent.
  fallbackLng: false,
  interpolation: {
    escapeValue: false,
  },
});

// Both halves must settle before anything renders: init decides which
// language is active, loadLanguage supplies its strings.
export const ready = Promise.all([
  initialized,
  loadLanguage(i18n, savedLanguage),
]).then(([, language]) =>
  language === savedLanguage ? language : i18n.changeLanguage(language),
);

export default i18n;
