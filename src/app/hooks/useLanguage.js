import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadLanguage } from "@/locales/loadLanguage";
import { getAppLanguage, getIntlLocale, getSpeechLocale } from "@/utils/locale";
import { setStorageItem } from "@/utils/safeStorage";

const LANGUAGE_STORAGE_KEY = "app_language";

export function useLanguage() {
  const { i18n, t } = useTranslation();
  const lang = getAppLanguage(i18n.resolvedLanguage || i18n.language || "ru");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Only the active language is bundled, so the next one has to arrive before
  // the switch — otherwise the interface would redraw in raw keys while its
  // chunk downloads. loadLanguage resolves to what is actually available, so a
  // chunk that never arrives leaves the current language in place instead of
  // switching to an empty one. The preference is stored only once the switch
  // is known to work, so a failed download is not remembered.
  const setLanguage = useCallback(
    async (nextLang) => {
      const available = await loadLanguage(i18n, nextLang);
      // resolvedLanguage is unset while fallbacks are disabled, so `language`
      // is the one that always reflects the active choice.
      if (available !== (i18n.resolvedLanguage ?? i18n.language)) {
        await i18n.changeLanguage(available);
      }
      if (available === nextLang) {
        setStorageItem(LANGUAGE_STORAGE_KEY, nextLang);
      }
      return available;
    },
    [i18n],
  );

  const toggleLanguage = useCallback(
    () => setLanguage(lang === "ru" ? "en" : "ru"),
    [lang, setLanguage],
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
