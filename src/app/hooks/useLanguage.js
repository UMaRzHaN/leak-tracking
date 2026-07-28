import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getAppLanguage, getIntlLocale, getSpeechLocale } from "@/utils/locale";
import { setStorageItem } from "@/utils/safeStorage";

const LANGUAGE_STORAGE_KEY = "app_language";

export function useLanguage() {
  const { i18n, t } = useTranslation();
  const lang = getAppLanguage(i18n.resolvedLanguage || i18n.language || "ru");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLanguage = useCallback(() => {
    const next = lang === "ru" ? "en" : "ru";

    setStorageItem(LANGUAGE_STORAGE_KEY, next);
    i18n.changeLanguage(next);
  }, [i18n, lang]);

  const setLanguage = useCallback(
    (nextLang) => {
      setStorageItem(LANGUAGE_STORAGE_KEY, nextLang);
      i18n.changeLanguage(nextLang);
    },
    [i18n],
  );

  return {
    lang,
    intlLocale: getIntlLocale(lang),
    speechLocale: getSpeechLocale(lang),
    toggleLanguage,
    setLanguage,
    t,
  };
}
