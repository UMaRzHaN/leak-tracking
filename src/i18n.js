import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getStorageItem } from "@/utils/safeStorage";
import { translation as ru } from "@/locales/ru";
import { translation as en } from "@/locales/en";

const LANGUAGE_STORAGE_KEY = "app_language";

const savedLanguage = getStorageItem(LANGUAGE_STORAGE_KEY, "ru");

const resources = {
  ru: { translation: ru },
  en: { translation: en },
};

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "ru",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
