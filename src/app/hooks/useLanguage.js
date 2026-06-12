import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useLanguage() {
  const { i18n, t } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || "ru";

  const toggleLanguage = useCallback(() => {
    const next = lang === "ru" ? "en" : "ru";
    i18n.changeLanguage(next);
  }, [i18n, lang]);

  return {
    lang,
    toggleLanguage,
    t,
  };
}
