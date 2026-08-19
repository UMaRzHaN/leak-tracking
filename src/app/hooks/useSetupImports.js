import { useCallback } from "react";
import { rollbackImportedProject } from "@/services/backup/projectCleanup";
import { waitForRefValue } from "./waitForProjectSwitch";

/**
 * Первый экран: проект заводится из файла, а не из формы.
 *
 * Три входа — ZIP-бэкап, XLSX-отчёт и архив инвентаризации — приводят к одному
 * и тому же: появляется проект и в нём появляются данные. Отличаются они лишь
 * тем, сколько о проекте известно самому файлу, и это единственное, что здесь
 * решается: бэкап знает про себя всё, отчёт — имя и, если повезло, тип,
 * инвентаризация не знает ничего.
 *
 * Держится отдельно от `useAppBootstrap` потому, что это законченный кусок:
 * заведение проекта из файла с откатом, если на полпути не сложилось. В
 * оркестраторе оно тонуло среди состояния экранов и подписок.
 */

export function useSetupImports({
  runWithImportOverlay,
  stableImportCtx,
  activeProjectIdRef,
  saveRef,
  addProject,
  removeProject,
  overwriteProject,
  clearForm,
  handleCreateExcelCopy,
}) {
  /** Бэкап знает про себя всё; имя и тип нужны только старым архивам без project.json. */
  const handleSetupImportZip = useCallback(
    (file, fallback = {}) =>
      runWithImportOverlay(async () => {
        const { importProjectZip } =
          await import("@/services/backup/projectBackupService");
        return importProjectZip(file, {
          ...stableImportCtx,
          metaFallback: fallback,
        });
      }),
    [runWithImportOverlay, stableImportCtx],
  );

  /**
   * Архив инвентаризации не несёт ни имени проекта, ни его типа — только
   * карточки: инвентаризацию отдают отдельно от отчёта по утечкам, и она
   * ничего не знает о том, кто и как считает выбросы. Имя берётся из имени
   * файла (его пишет сама выгрузка: «!Inventorization_Бузахур»), тип — тот,
   * который вообще ведёт реестр, а если человек уже выбрал тип на экране, то
   * его.
   */
  const handleSetupImportInventory = useCallback(
    (file, /** @type {{name?: string, type?: string}} */ { name, type } = {}) =>
      runWithImportOverlay(async () => {
        const [
          { componentRegistryProjectTypes, loadComponentRegistry },
          { importInventoryFile },
        ] = await Promise.all([
          import("@/configs/projectAdapter"),
          import("@/services/inventory/inventoryImport"),
        ]);

        const registryTypes = componentRegistryProjectTypes();
        const resolvedType =
          type || (registryTypes.length === 1 ? registryTypes[0] : null);
        if (!resolvedType) {
          const error = new Error("Project type is missing");
          error.code = "MISSING_PROJECT_TYPE";
          throw error;
        }

        const previousProjectId = activeProjectIdRef.current;
        const newProject = addProject(name, resolvedType);
        if (!newProject) throw new Error("Не удалось создать проект");

        try {
          await waitForRefValue(activeProjectIdRef, newProject.id);
          const registry = await loadComponentRegistry(newProject);
          const result = await importInventoryFile(file, newProject, registry);
          if (!result.added && !result.updated) {
            const error = new Error("No components found in the archive");
            error.code = "EMPTY_INVENTORY";
            throw error;
          }
          // Записей об утечках в таком архиве нет, и это не ошибка: обход
          // железа начинается раньше, чем находят первую утечку.
          await saveRef.current([]);
          clearForm();
          return {
            project: newProject,
            leakCount: 0,
            components: result.added,
          };
        } catch (error) {
          try {
            try {
              const rollback = await rollbackImportedProject(
                newProject,
                removeProject,
              );
              if (!rollback.cleanupComplete) {
                error.rollbackCleanupError = rollback.cleanupError;
              }
            } catch (rollbackError) {
              error.rollbackError = rollbackError;
            }
          } finally {
            if (previousProjectId) overwriteProject(previousProjectId);
          }
          throw error;
        }
      }),
    [
      activeProjectIdRef,
      addProject,
      clearForm,
      overwriteProject,
      removeProject,
      runWithImportOverlay,
      saveRef,
    ],
  );

  const handleSetupImportExcel = useCallback(
    async (file, { name, type }) => {
      const { parseExcelImportFile } =
        await import("@/services/import/excelImportService");
      const result = await parseExcelImportFile(file, {
        // Do not invent an upstream project type on the first-run screen.
        // Ordinary XLSX files are parsed with their common columns first and
        // the resulting leak fields are then used for type detection below.
        projectType: type || undefined,
      });
      if (!result.leaks.length && !result.portableArchive) {
        const error = new Error("No importable rows found in XLSX");
        error.code = "EMPTY_EXCEL";
        throw error;
      }
      let resolvedType = result.project?.type || type;
      if (!resolvedType) {
        const { detectProjectTypeFromLeaks } =
          await import("@/services/backup/projectBackupService");
        resolvedType = detectProjectTypeFromLeaks(result.leaks);
      }
      if (!resolvedType) {
        const error = new Error("Project type is missing");
        error.code = "MISSING_PROJECT_TYPE";
        throw error;
      }
      return handleCreateExcelCopy({
        name: result.project?.name || name,
        type: resolvedType,
        leaks: result.leaks,
        monitoringRound: result.monitoringRound,
        vars: result.vars,
        settings: result.settings,
        syncId: result.project?.syncId,
        sync: result.sync,
      });
    },
    [handleCreateExcelCopy],
  );

  return {
    handleSetupImportZip,
    handleSetupImportInventory,
    handleSetupImportExcel,
  };
}
