import { useCallback, useRef, useState } from "react";
import { isNative } from "@/utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { LeakRepository } from "@/repositories/LeakRepository";

const VALID_TYPES = ["upstream", "midstream", "downstream"];
const CONFLICT_CLOSED = { open: false };

function detectTypeFromFileName(str) {
  const lower = str.toLowerCase();
  if (lower.includes("downstream")) return "downstream";
  if (lower.includes("midstream")) return "midstream";
  if (lower.includes("upstream")) return "upstream";
  return null;
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
  const importZipRef = useRef(null);
  const [conflictState, setConflictState] = useState(CONFLICT_CLOSED);

  const handleExportZip = useCallback(async () => {
    if (!data.length) {
      notify("warning", "Нет данных для экспорта");
      return;
    }

    const folder = activeProject?.folderName ?? "backup";
    const fileName = `${folder}.zip`;
    try {
      const { buildProjectBackupZip } = await import("@/pages/Settings/backup");
      const blob = await buildProjectBackupZip({
        leaks: data,
        idbGet: idbGetPhoto,
        project: activeProject,
        vars,
      });

      if (isNative) {
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        }).catch(() => {});
        try {
          await Filesystem.deleteFile({
            path: `${folder}/${fileName}`,
            directory: Directory.Documents,
          });
        } catch (e) {
          console.log("Old ZIP file not found:", e?.message);
        }

        await Filesystem.writeFile({
          path: `${folder}/${fileName}`,
          directory: Directory.Documents,
          data: base64,
        });
        notify("success", `ZIP сохранён в Документы/${folder}/`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        notify("success", `ZIP-архив скачан (${data.length} записей)`);
      }
    } catch (err) {
      notify("error", "Ошибка экспорта: " + err.message);
    }
  }, [data, idbGetPhoto, activeProject, vars, notify]);

  const handleImportZip = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const { peekBackupZip } = await import("@/pages/Settings/backup");
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
            `Не удалось определить тип проекта из файла «${file.name}». Переименуйте файл, добавив в имя upstream / midstream / downstream.`,
          );
          e.target.value = "";
          return;
        }

        // ── Conflict detection ────────────────────────────────────────────────
        const existing = projects?.find(
          (p) =>
            p.name.trim().toLowerCase() === resolvedName.trim().toLowerCase(),
        );

        if (existing) {
          const existingLeaks = await LeakRepository.getAll({
            projectId: existing.id,
            folderName: existing.folderName,
          });
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
          });
          e.target.value = "";
          return;
        }

        // ── No conflict — existing flow ───────────────────────────────────────
        const typeLabel = {
          upstream: "Добыча",
          midstream: "Транспортировка",
          downstream: "Переработка",
        }[resolvedType];
        const source = metaProject?.type
          ? "project.json"
          : peek.detectedType
            ? "данных записей"
            : "имени файла";
        const ok = window.confirm(
          `Импортировать проект?\n\nНазвание: ${resolvedName}\nТип: ${typeLabel} (${resolvedType})\nЗаписей: ${peek.leaks.length}\nОпределено по: ${source}\n\nБудет создан новый проект.`,
        );
        if (!ok) {
          e.target.value = "";
          return;
        }

        const fallback = metaProject
          ? undefined
          : { name: resolvedName, type: resolvedType };
        const result = await onImportZip(file, fallback);
        if (!result?.project)
          throw new Error("Не удалось получить данные проекта из файла");
        notify(
          "success",
          `Импортирован проект «${result.project.name}» (${result.leakCount} записей)`,
        );
      } catch (err) {
        notify("error", "Ошибка импорта: " + err.message);
      }

      e.target.value = "";
    },
    [onImportZip, notify, projects],
  );

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
        `Проект «${result.project.name}» перезаписан (${result.leakCount} записей)`,
      );
    } catch (err) {
      notify("error", "Ошибка импорта: " + err.message);
    }
    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, onImportIntoExisting, notify]);

  const handleConflictMerge = useCallback(async () => {
    const { file, existingProject } = conflictState;
    try {
      const result = await onImportIntoExisting(file, existingProject, "merge");
      notify(
        "success",
        `Объединено с «${result.project.name}» (добавлено из архива: ${result.leakCount} записей)`,
      );
    } catch (err) {
      notify("error", "Ошибка импорта: " + err.message);
    }
    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, onImportIntoExisting, notify]);

  const handleConflictCopy = useCallback(async () => {
    const { file, resolvedName, resolvedType, fallback } = conflictState;
    const copyName = `${resolvedName} (2)`;
    try {
      const result = await onImportZip(
        file,
        fallback ?? { name: copyName, type: resolvedType },
        { overrideName: copyName },
      );
      if (!result?.project) throw new Error("Не удалось создать проект");
      notify(
        "success",
        `Создана копия «${result.project.name}» (${result.leakCount} записей)`,
      );
    } catch (err) {
      notify("error", "Ошибка импорта: " + err.message);
    }
    setConflictState(CONFLICT_CLOSED);
  }, [conflictState, onImportZip, notify]);

  return {
    importZipRef,
    handleExportZip,
    handleImportZip,
    conflictState,
    setConflictState,
    handleConflictOverwrite,
    handleConflictMerge,
    handleConflictCopy,
  };
}
