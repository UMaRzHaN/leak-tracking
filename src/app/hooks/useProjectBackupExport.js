import { useCallback, useState } from "react";
import { errorText } from "@/utils/appError";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { isNative } from "@/utils/platform";
import {
  LEAK_BACKUP_DIR,
  projectExportFolder,
} from "@/services/storage/exportFolders";

function pluralRecords(count, lang) {
  if (lang !== "ru") return count === 1 ? "record" : "records";
  if (count % 10 === 1 && count % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "записи";
  }
  return "записей";
}

/** Есть ли в реестре компонентов хоть что-то, ради чего стоит собрать архив. */
async function hasComponentsToExport(project) {
  if (!project?.id) return false;
  try {
    const { ComponentRepository } =
      await import("@/repositories/ComponentRepository");
    const components = await ComponentRepository.load(project);
    return Array.isArray(components) && components.length > 0;
  } catch {
    // Реестр, который не читается, — не повод отказать в выгрузке утечек;
    // выше по коду решение принимается по ним.
    return false;
  }
}

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

    // Утечки — не единственное, что лежит в архиве: туда же идут реестр
    // компонентов и чертежи. Проект, где утечек ещё нет, а компоненты уже
    // заведены, отказывался выгружаться, хотя выгружать было что.
    if (!data.length && !(await hasComponentsToExport(activeProject))) {
      notify("warning", t("settings.noDataToExport"));
      return;
    }

    const projectFolder = activeProject?.folderName ?? "backup";
    // Своей папкой внутри проекта, рядом с zip_xlsx: на телефоне два архива
    // с похожими именами различаются только тем, где они лежат.
    const folder = projectExportFolder(projectFolder, LEAK_BACKUP_DIR);
    const fileName = `${projectFolder}.zip`;

    try {
      setIsExporting(true);
      notify("info", t("settings.zipBackupExportIn"), { autoCloseMs: 0 });

      if (isNative) {
        const [{ streamProjectBackupZip }, { writePublicFileStream }] =
          await Promise.all([
            import("@/services/backup/projectBackupService"),
            import("@/services/storage/publicFileWriter"),
          ]);
        await writePublicFileStream({
          folder,
          fileName,
          mimeType: "application/zip",
          produce: (writeChunk) =>
            streamProjectBackupZip({
              leaks: data,
              idbGet: idbGetPhoto,
              project: activeProject,
              vars,
              writeChunk,
            }),
        });

        notify("success", t("settings.zipSavedToDocuments", { v1: folder }));
      } else {
        const { buildProjectBackupZip } =
          await import("@/services/backup/projectBackupService");
        const blob = await buildProjectBackupZip({
          leaks: data,
          idbGet: idbGetPhoto,
          project: activeProject,
          vars,
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);

        notify(
          "success",
          t("settings.zipArchiveDownloadedV", {
            v1: data.length,
            v2: pluralRecords(data.length, lang),
          }),
        );
      }
    } catch (error) {
      notify("error", `${t("settings.exportError")}: ${errorText(error, t)}`);
    } finally {
      setIsExporting(false);
    }
  }, [activeProject, data, idbGetPhoto, isExporting, lang, notify, t, vars]);

  return { exportBackup, isExporting };
}
