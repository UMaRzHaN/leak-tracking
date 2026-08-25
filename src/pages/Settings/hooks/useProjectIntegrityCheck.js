import { errorText } from "@/utils/appError";
import { useCallback, useState } from "react";

/**
 * Проверка данных проекта: её состояние и её запуск.
 *
 * Отдельным хуком, потому что заботa самостоятельная — своя пара состояний,
 * свой обработчик и своя ленивая загрузка сервиса, — а `useSettingsPage`
 * собирает весь экран настроек и без неё достаточно велик.
 *
 * @param {{
 *   data: any[],
 *   activeProject: {id?: string, type?: string}|null,
 *   idbGetPhoto?: Function,
 *   leakPhotoRequired?: boolean,
 *   monitoringPhotoRequired?: boolean,
 *   notify: Function,
 *   t: (key: string, params?: any) => string,
 * }} options
 */
export function useProjectIntegrityCheck({
  data,
  activeProject,
  idbGetPhoto,
  leakPhotoRequired,
  monitoringPhotoRequired,
  notify,
  t,
}) {
  const [integrityReport, setIntegrityReport] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);

  const handleCheckIntegrity = useCallback(async () => {
    setCheckingIntegrity(true);
    try {
      const { analyzeProjectIntegrity, readComponentRegistryIds } =
        await import("@/services/backup/projectIntegrityService");
      const report = await analyzeProjectIntegrity(data, {
        idbGetPhoto,
        leakPhotoRequired,
        monitoringPhotoRequired,
        componentIds: await readComponentRegistryIds(activeProject),
      });
      setIntegrityReport(report);
      notify(
        report.ok ? "success" : "warning",
        report.ok
          ? t("settings.noDataIssuesFound")
          : t("settings.checkCompleteVIssues", { v1: report.issues }),
      );
    } catch (error) {
      notify("error", `${t("settings.checkError")}: ${errorText(error, t)}`);
    } finally {
      setCheckingIntegrity(false);
    }
  }, [
    activeProject,
    data,
    idbGetPhoto,
    leakPhotoRequired,
    monitoringPhotoRequired,
    notify,
    t,
  ]);

  return {
    integrityReport,
    // Отчёт стареет от смены требований к фотографиям: он посчитан по прежним,
    // и оставить его на экране значит показывать ответ на снятый вопрос.
    setIntegrityReport,
    checkingIntegrity,
    handleCheckIntegrity,
  };
}
