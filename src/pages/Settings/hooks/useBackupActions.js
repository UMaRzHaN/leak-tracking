import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { LeakRepository } from "@/repositories/LeakRepository";
import { isNative } from "@/utils/platform";

const VALID_TYPES = ["upstream", "midstream", "downstream"];
const CONFLICT_CLOSED = { open: false };
const IMPORT_CONFIRM_CLOSED = { open: false };

function detectTypeFromFileName(str) {
  const lower = str.toLowerCase();
  if (lower.includes("downstream")) return "downstream";
  if (lower.includes("midstream")) return "midstream";
  if (lower.includes("upstream")) return "upstream";
  return null;
}

function pluralRecords(count, lang) {
  if (lang !== "ru") return count === 1 ? "record" : "records";
  if (count % 10 === 1 && count % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "записи";
  }
  return "записей";
}

function typeLabel(type, lang) {
  const labels = {
    upstream: lang === "ru" ? "Добыча" : "Upstream",
    midstream: lang === "ru" ? "Транспортировка" : "Midstream",
    downstream: lang === "ru" ? "Переработка" : "Downstream",
  };

  return labels[type] ?? type;
}

export function useBackupActions({
  data,
  idbGetPhoto,
  activeProject,
  vars,
  onImportZip,
  onImportIntoExisting,
  notify,
  projects,
}) {
  const { lang } = useLanguage();
  const importZipRef = useRef(null);
  const [conflictState, setConflictState] = useState(CONFLICT_CLOSED);
  const [importConfirmState, setImportConfirmState] = useState(
    IMPORT_CONFIRM_CLOSED,
  );

  const importProject = useCallback(
    async (file, fallback) => {
      const result = await onImportZip(file, fallback);
      if (!result?.project) {
        throw new Error(
          lang === "ru"
            ? "Не удалось получить данные проекта из файла"
            : "Could not read project data from file",
        );
      }

      notify(
        "success",
        lang === "ru"
          ? `Импортирован проект «${result.project.name}» (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`
          : `Project "${result.project.name}" imported (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`,
      );
    },
    [lang, notify, onImportZip],
  );

  const handleExportZip = useCallback(async () => {
    if (!data.length) {
      notify(
        "warning",
        lang === "ru" ? "Нет данных для экспорта" : "No data to export",
      );
      return;
    }

    const folder = activeProject?.folderName ?? "backup";
    const fileName = `${folder}.zip`;

    try {
      const { buildProjectBackupZip } =
        await import("@/services/projectBackupService");
      const blob = await buildProjectBackupZip({
        leaks: data,
        idbGet: idbGetPhoto,
        project: activeProject,
        vars,
      });

      if (isNative) {
        const { writePublicFile } = await import("@/services/publicFileWriter");
        await writePublicFile({
          folder,
          fileName,
          blob,
          mimeType: "application/zip",
        });

        notify(
          "success",
          lang === "ru"
            ? `ZIP сохранён в Документы/${folder}/`
            : `ZIP saved to Documents/${folder}/`,
        );
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);

        notify(
          "success",
          lang === "ru"
            ? `ZIP-архив скачан (${data.length} ${pluralRecords(data.length, lang)})`
            : `ZIP archive downloaded (${data.length} ${pluralRecords(data.length, lang)})`,
        );
      }
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка экспорта" : "Export error"}: ${error.message}`,
      );
    }
  }, [activeProject, data, idbGetPhoto, lang, notify, vars]);

  const handleImportZip = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const { peekBackupZip, previewMergeLeaks } =
          await import("@/services/projectBackupService");
        const peek = await peekBackupZip(file);
        const metaProject = peek.meta?.project;

        const resolvedName =
          metaProject?.name || file.name.replace(/\.zip$/i, "");
        const resolvedType =
          (metaProject?.type && VALID_TYPES.includes(metaProject.type)
            ? metaProject.type
            : null) ||
          peek.detectedType ||
          detectTypeFromFileName(file.name);

        if (!resolvedType) {
          notify(
            "error",
            lang === "ru"
              ? `Не удалось определить тип проекта из файла «${file.name}». Переименуйте файл, добавив в имя upstream / midstream / downstream.`
              : `Could not determine the project type from file "${file.name}". Rename the file to include upstream / midstream / downstream.`,
          );
          event.target.value = "";
          return;
        }

        const existing = projects?.find(
          (project) =>
            project.name.trim().toLowerCase() ===
            resolvedName.trim().toLowerCase(),
        );

        if (existing) {
          const existingLeaks = await LeakRepository.getAll({
            projectId: existing.id,
            folderName: existing.folderName,
          });
          const mergePreview = previewMergeLeaks(existingLeaks, peek.leaks);
          setConflictState({
            open: true,
            file,
            resolvedName,
            resolvedType,
            fallback: metaProject
              ? undefined
              : { name: resolvedName, type: resolvedType },
            existingProject: { ...existing, leakCount: existingLeaks.length },
            leakCount: peek.leaks.length,
            mergePreview,
          });
          event.target.value = "";
          return;
        }

        const source = metaProject?.type
          ? "project.json"
          : peek.detectedType
            ? lang === "ru"
              ? "данным записей"
              : "record data"
            : lang === "ru"
              ? "имени файла"
              : "file name";

        setImportConfirmState({
          open: true,
          file,
          fallback: metaProject
            ? undefined
            : { name: resolvedName, type: resolvedType },
          title: lang === "ru" ? "Импортировать проект?" : "Import project?",
          description:
            lang === "ru"
              ? `Название: ${resolvedName}\nТип: ${typeLabel(
                  resolvedType,
                  lang,
                )} (${resolvedType})\nЗаписей: ${peek.leaks.length}\nОпределено по: ${source}\n\nБудет создан новый проект.`
              : `Name: ${resolvedName}\nType: ${typeLabel(
                  resolvedType,
                  lang,
                )} (${resolvedType})\nRecords: ${peek.leaks.length}\nDetected from: ${source}\n\nA new project will be created.`,
          confirmLabel: lang === "ru" ? "Импортировать" : "Import",
          cancelLabel: lang === "ru" ? "Отмена" : "Cancel",
        });
      } catch (error) {
        notify(
          "error",
          `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`,
        );
      }

      event.target.value = "";
    },
    [lang, notify, projects],
  );

  const confirmImport = useCallback(async () => {
    const { file, fallback } = importConfirmState;
    if (!file) return;
    setImportConfirmState(IMPORT_CONFIRM_CLOSED);

    try {
      await importProject(file, fallback);
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`,
      );
    }
  }, [importConfirmState, importProject, lang, notify]);

  const cancelImport = useCallback(() => {
    setImportConfirmState(IMPORT_CONFIRM_CLOSED);
  }, []);

  const handleConflictOverwrite = useCallback(async () => {
    const { file, existingProject } = conflictState;

    try {
      const result = await onImportIntoExisting(
        file,
        existingProject,
        "overwrite",
      );
      notify(
        "success",
        lang === "ru"
          ? `Проект «${result.project.name}» перезаписан (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`
          : `Project "${result.project.name}" overwritten (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`,
      );
    }

    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, lang, notify, onImportIntoExisting]);

  const handleConflictMerge = useCallback(async () => {
    const { file, existingProject } = conflictState;

    try {
      const result = await onImportIntoExisting(file, existingProject, "merge");
      notify(
        "success",
        lang === "ru"
          ? `Объединено с «${result.project.name}» (из архива применено: ${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`
          : `Merged into "${result.project.name}" (applied from archive: ${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`,
      );
    }

    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, lang, notify, onImportIntoExisting]);

  const handleConflictCopy = useCallback(async () => {
    const { file, resolvedName, resolvedType, fallback } = conflictState;
    const copyName = `${resolvedName} (2)`;

    try {
      const result = await onImportZip(
        file,
        fallback ?? { name: copyName, type: resolvedType },
        { overrideName: copyName },
      );
      if (!result?.project) {
        throw new Error(
          lang === "ru"
            ? "Не удалось создать проект"
            : "Could not create project",
        );
      }

      notify(
        "success",
        lang === "ru"
          ? `Создана копия «${result.project.name}» (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`
          : `Copy "${result.project.name}" created (${result.leakCount} ${pluralRecords(
              result.leakCount,
              lang,
            )})`,
      );
    } catch (error) {
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`,
      );
    }

    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, lang, notify, onImportZip]);

  return {
    importZipRef,
    handleExportZip,
    handleImportZip,
    importConfirmState,
    confirmImport,
    cancelImport,
    conflictState,
    setConflictState,
    handleConflictOverwrite,
    handleConflictMerge,
    handleConflictCopy,
  };
}
