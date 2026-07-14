import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";

export function useSettingsTexts() {
  const { lang, t, toggleLanguage } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      title: t("settings.title"),
      appearanceTitle: t("settings.appearanceTitle"),
      themeLabelLight: t("settings.themeLabelLight"),
      themeLabelDark: t("settings.themeLabelDark"),
      themeHintLight: t("settings.themeHintLight"),
      themeHintDark: t("settings.themeHintDark"),
      languageLabel: t("settings.languageLabel"),
      languageHintRu: t("settings.languageHintRu"),
      languageHintEn: t("settings.languageHintEn"),
      toggleButtonRu: t("settings.toggleButtonRu"),
      toggleButtonEn: t("settings.toggleButtonEn"),
      projects: t("settings.projects"),
      addProject: t("settings.addProject"),
      noProjects: t("settings.noProjects"),
      calculationParameters: t("settings.calculationParameters"),
      projectSettings: t("settings.projectSettings"),
      editParameters: t("settings.editParameters"),
      fieldsAndExcel: t("settings.fieldsAndExcel"),
      fieldsDescription: t("settings.fieldsDescription"),
      configureFields: t("settings.configureFields"),
      excelExportMode: t("settings.excelExportMode"),
      excelExportFull: t("settings.excelExportFull"),
      excelExportFullHint: t("settings.excelExportFullHint"),
      excelExportLatest: t("settings.excelExportLatest"),
      excelExportLatestHint: t("settings.excelExportLatestHint"),
      backup: t("settings.backup"),
      exportZip: t("settings.exportZip"),
      importZip: t("settings.importZip"),
      importExcel: t("settings.importExcel", {
        defaultValue: lang === "ru" ? "Импорт Excel" : "Import Excel",
      }),
      importExcelLoading: t("settings.importExcelLoading", {
        defaultValue: lang === "ru" ? "Импорт..." : "Import...",
      }),
      backupHint: t("settings.backupHint"),
      mapCache: t("settings.mapCache"),
      satelliteTiles: t("settings.satelliteTiles"),
      cacheEmpty: t("settings.cacheEmpty"),
      loading: t("settings.loading"),
      clearMapCache: t("settings.clearMapCache"),
      dangerZone: t("settings.dangerZone"),
      dangerHint: t("settings.dangerHint"),
      clearDatabase: t("settings.clearDatabase"),
      notifications: {
        parametersSaved: t("settings.notifications.parametersSaved"),
        changesCanceled: t("settings.notifications.changesCanceled"),
        cacheCleared: t("settings.notifications.cacheCleared"),
        databaseCleared: t("settings.notifications.databaseCleared"),
        allFieldsActive: t("settings.notifications.allFieldsActive"),
        excelExportModeSaved: t("settings.notifications.excelExportModeSaved"),
      },
      dialogs: {
        clearMapCache: t("settings.dialogs.clearMapCache"),
        clearDatabase: t("settings.dialogs.clearDatabase"),
      },
    }),
    [lang, t],
  );

  return { lang, t, toggleLanguage, localeTexts };
}
