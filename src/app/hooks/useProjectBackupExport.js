import { useCallback, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";

/**
 * ZIP-бэкап проекта — из меню, как экспорт отчёта и импорт. Раньше он жил в
 * настройках; там остались только параметры проекта, а действия с данными
 * собраны в одном месте.
 *
 * `dataLoaded` — данные загружены именно для `activeProject`. Сразу после
 * смены проекта `activeProject` уже новый, а `data` ещё старого: архив
 * получил бы имя нового проекта и утечки прежнего. До загрузки выгрузка не
 * начинается, а меню кнопку не показывает (`canExport`).
 *
 * @param {{ data: any[], activeProject: any, dataLoaded?: boolean, notify: (type: string, message: string, options?: any) => void }} options
 */
export function useProjectBackupExport({
  data,
  activeProject,
  dataLoaded = true,
  notify,
}) {
  const { lang, t } = useLanguage();
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const [isExporting, setIsExporting] = useState(false);

  const exportBackup = useCallback(async () => {
    if (isExporting || !dataLoaded || !activeProject) return;
    const { runProjectBackupExport } = await import("./projectBackupExportRun");
    await runProjectBackupExport({
      data,
      activeProject,
      notify,
      t,
      lang,
      idbGetPhoto,
      vars,
      setBusy: setIsExporting,
    });
  }, [
    activeProject,
    data,
    dataLoaded,
    idbGetPhoto,
    isExporting,
    lang,
    notify,
    t,
    vars,
  ]);

  return {
    exportBackup,
    isExporting,
    canExport: Boolean(activeProject) && dataLoaded,
  };
}
