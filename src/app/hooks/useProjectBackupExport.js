import { useCallback, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";

/**
 * ZIP-бэкап проекта — из меню, как экспорт отчёта и импорт. Раньше он жил в
 * настройках; там остались только параметры проекта, а действия с данными
 * собраны в одном месте.
 *
 * @param {{ data: any[], activeProject: any, notify: (type: string, message: string, options?: any) => void }} options
 */
export function useProjectBackupExport({ data, activeProject, notify }) {
  const { lang, t } = useLanguage();
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const { vars } = useProjectVars(activeProject?.id ?? null);
  const [isExporting, setIsExporting] = useState(false);

  const exportBackup = useCallback(async () => {
    if (isExporting) return;
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
  }, [activeProject, data, idbGetPhoto, isExporting, lang, notify, t, vars]);

  return { exportBackup, isExporting };
}
