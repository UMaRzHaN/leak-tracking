import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { LeakRepository } from "@/repositories/LeakRepository";
import { isNative } from "@/utils/platform";

const VALID_TYPES = ["upstream", "midstream", "downstream"];
const CONFLICT_CLOSED = /** @type {any} */ ({ open: false });
const IMPORT_CONFIRM_CLOSED = /** @type {any} */ ({ open: false });

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

function projectImportErrorMessage(error, lang) {
  if (error?.code === "PROJECT_TYPE_MISMATCH") {
    const current = typeLabel(error.existingProjectType, lang);
    const incoming = typeLabel(error.incomingProjectType, lang);
    return lang === "ru"
      ? `Нельзя объединить проекты разных типов: текущий — ${current}, импортируемый — ${incoming}.`
      : `Projects of different types cannot be combined: current — ${current}, imported — ${incoming}.`;
  }

  if (error?.code === "PROJECT_TYPE_MISSING") {
    return lang === "ru"
      ? "В архиве не указан тип проекта. Импорт в существующий проект отменён."
      : "The archive does not specify a project type. Import into the existing project was cancelled.";
  }

  if (error?.code === "CURRENT_PROJECT_TYPE_MISSING") {
    return lang === "ru"
      ? "У текущего проекта не определён тип. Импорт отменён."
      : "The current project has no defined type. Import was cancelled.";
  }

  return `${lang === "ru" ? "Ошибка импорта" : "Import error"}: ${error.message}`;
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
  const [isExportingZip, setIsExportingZip] = useState(false);

  const notifyZipImportProgress = useCallback(() => {
    notify(
      "info",
      lang === "ru"
        ? "Идёт импорт ZIP backup, подождите..."
        : "ZIP backup import in progress, please wait...",
      { autoCloseMs: 0 },
    );
  }, [lang, notify]);

  const notifyZipReadProgress = useCallback(() => {
    notify(
      "info",
      lang === "ru"
        ? "Идёт чтение ZIP backup, подождите..."
        : "Reading ZIP backup, please wait...",
      { autoCloseMs: 0 },
    );
  }, [lang, notify]);

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
    if (isExportingZip) return;

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
      setIsExportingZip(true);
      notify(
        "info",
        lang === "ru"
          ? "Идёт экспорт ZIP backup, подождите..."
          : "ZIP backup export in progress, please wait...",
        { autoCloseMs: 0 },
      );

      if (isNative) {
        const [{ streamProjectBackupZip }, { writePublicFileStream }] =
          await Promise.all([
            import("@/services/projectBackupService"),
            import("@/services/publicFileWriter"),
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

        notify(
          "success",
          lang === "ru"
            ? `ZIP сохранён в Документы/${folder}/`
            : `ZIP saved to Documents/${folder}/`,
        );
      } else {
        const { buildProjectBackupZip } =
          await import("@/services/projectBackupService");
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
    } finally {
      setIsExportingZip(false);
    }
  }, [activeProject, data, idbGetPhoto, isExportingZip, lang, notify, vars]);

  const handleImportZip = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        notifyZipReadProgress();
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
            ...(existing.legacyStorageType
              ? { legacyStorageType: existing.legacyStorageType }
              : {}),
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
    [lang, notify, notifyZipReadProgress, projects],
  );

  const confirmImport = useCallback(async () => {
    const { file, fallback } = importConfirmState;
    if (!file) return;
    setImportConfirmState(IMPORT_CONFIRM_CLOSED);

    try {
      notifyZipImportProgress();
      await importProject(file, fallback);
    } catch (error) {
      notify("error", projectImportErrorMessage(error, lang));
    }
  }, [
    importConfirmState,
    importProject,
    lang,
    notify,
    notifyZipImportProgress,
  ]);

  const cancelImport = useCallback(() => {
    setImportConfirmState(IMPORT_CONFIRM_CLOSED);
  }, []);

  const handleConflictOverwrite = useCallback(async () => {
    const { file, existingProject } = conflictState;

    try {
      notifyZipImportProgress();
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
      notify("error", projectImportErrorMessage(error, lang));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [
    conflictState,
    lang,
    notify,
    notifyZipImportProgress,
    onImportIntoExisting,
  ]);

  const handleConflictMerge = useCallback(async () => {
    const { file, existingProject } = conflictState;

    try {
      notifyZipImportProgress();
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
      notify("error", projectImportErrorMessage(error, lang));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [
    conflictState,
    lang,
    notify,
    notifyZipImportProgress,
    onImportIntoExisting,
  ]);

  const handleConflictCopy = useCallback(async () => {
    const { file, resolvedName, resolvedType, fallback } = conflictState;
    const copyName = `${resolvedName} (2)`;

    try {
      notifyZipImportProgress();
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
      notify("error", projectImportErrorMessage(error, lang));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, lang, notify, notifyZipImportProgress, onImportZip]);

  return {
    importZipRef,
    handleExportZip,
    isExportingZip,
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
