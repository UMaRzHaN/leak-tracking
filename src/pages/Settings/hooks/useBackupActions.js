import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { LeakRepository } from "@/repositories/LeakRepository";
import { isNative } from "@/utils/platform";
import {
  LEAK_BACKUP_DIR,
  projectExportFolder,
} from "@/services/storage/exportFolders";

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

function typeLabel(type, t) {
  const labels = {
    upstream: t("settings.projectTypes.upstream"),
    midstream: t("settings.projectTypes.midstream"),
    downstream: t("settings.projectTypes.downstream"),
  };

  return labels[type] ?? type;
}

function projectImportErrorMessage(error, t) {
  if (error?.code === "PROJECT_TYPE_MISMATCH") {
    const current = typeLabel(error.existingProjectType, t);
    const incoming = typeLabel(error.incomingProjectType, t);
    return t("settings.projectsOfDifferentTypes", {
      v1: current,
      v2: incoming,
    });
  }

  if (error?.code === "PROJECT_TYPE_MISSING") {
    return t("settings.theArchiveDoesNot");
  }

  if (error?.code === "CURRENT_PROJECT_TYPE_MISSING") {
    return t("settings.theCurrentProjectHas");
  }

  return `${t("settings.importError")}: ${error.message}`;
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
  const { lang, t } = useLanguage();
  const importZipRef = useRef(null);
  const [conflictState, setConflictState] = useState(CONFLICT_CLOSED);
  const [importConfirmState, setImportConfirmState] = useState(
    IMPORT_CONFIRM_CLOSED,
  );
  const [isExportingZip, setIsExportingZip] = useState(false);

  const notifyZipImportProgress = useCallback(() => {
    notify("info", t("settings.zipBackupImportIn"), { autoCloseMs: 0 });
  }, [notify, t]);
  const notifyZipReadProgress = useCallback(() => {
    notify("info", t("settings.readingZipBackupPlease"), { autoCloseMs: 0 });
  }, [notify, t]);
  const importProject = useCallback(
    async (file, fallback) => {
      const result = await onImportZip(file, fallback);
      if (!result?.project) {
        throw new Error(t("settings.couldNotReadProject"));
      }

      notify(
        "success",
        t("settings.projectVImportedV", {
          v1: result.project.name,
          v2: result.leakCount,
          v3: pluralRecords(result.leakCount, lang),
        }),
      );
    },
    [lang, notify, onImportZip, t],
  );

  const handleExportZip = useCallback(async () => {
    if (isExportingZip) return;

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
      setIsExportingZip(true);
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
      notify("error", `${t("settings.exportError")}: ${error.message}`);
    } finally {
      setIsExportingZip(false);
    }
  }, [activeProject, data, idbGetPhoto, isExportingZip, lang, notify, t, vars]);
  const handleImportZip = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        notifyZipReadProgress();
        const { peekBackupZip, previewMergeLeaks } =
          await import("@/services/backup/projectBackupService");
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
            t("settings.couldNotDetermineThe", { v1: file.name }),
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
            ? t("settings.recordData")
            : t("settings.fileName");

        setImportConfirmState({
          open: true,
          file,
          fallback: metaProject
            ? undefined
            : { name: resolvedName, type: resolvedType },
          title: t("settings.importProject"),
          description: t("settings.nameVTypeV", {
            v1: resolvedName,
            v2: typeLabel(resolvedType, t),
            v3: resolvedType,
            v4: peek.leaks.length,
            v5: source,
          }),
          confirmLabel: t("settings.importAction"),
          cancelLabel: t("settings.cancel"),
        });
      } catch (error) {
        notify("error", `${t("settings.importError")}: ${error.message}`);
      }

      event.target.value = "";
    },
    [notify, notifyZipReadProgress, projects, t],
  );

  const confirmImport = useCallback(async () => {
    const { file, fallback } = importConfirmState;
    if (!file) return;
    setImportConfirmState(IMPORT_CONFIRM_CLOSED);

    try {
      notifyZipImportProgress();
      await importProject(file, fallback);
    } catch (error) {
      notify("error", projectImportErrorMessage(error, t));
    }
  }, [importConfirmState, importProject, notify, notifyZipImportProgress, t]);

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
        t("settings.projectVOverwrittenV", {
          v1: result.project.name,
          v2: result.leakCount,
          v3: pluralRecords(result.leakCount, lang),
        }),
      );
    } catch (error) {
      notify("error", projectImportErrorMessage(error, t));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [
    conflictState,
    lang,
    notify,
    notifyZipImportProgress,
    onImportIntoExisting,
    t,
  ]);

  const handleConflictMerge = useCallback(async () => {
    const { file, existingProject } = conflictState;

    try {
      notifyZipImportProgress();
      const result = await onImportIntoExisting(file, existingProject, "merge");
      notify(
        "success",
        t("settings.mergedIntoVApplied", {
          v1: result.project.name,
          v2: result.leakCount,
          v3: pluralRecords(result.leakCount, lang),
        }),
      );
    } catch (error) {
      notify("error", projectImportErrorMessage(error, t));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [
    conflictState,
    lang,
    notify,
    notifyZipImportProgress,
    onImportIntoExisting,
    t,
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
        throw new Error(t("settings.couldNotCreateProject"));
      }

      notify(
        "success",
        t("settings.copyVCreatedV", {
          v1: result.project.name,
          v2: result.leakCount,
          v3: pluralRecords(result.leakCount, lang),
        }),
      );
    } catch (error) {
      notify("error", projectImportErrorMessage(error, t));
    }

    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, lang, notify, notifyZipImportProgress, onImportZip, t]);
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
