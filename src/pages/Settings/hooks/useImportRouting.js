import { useCallback } from "react";

/**
 * Импорт одной кнопкой.
 *
 * Раньше кнопок было три, и человеку с только что полученным файлом
 * приходилось знать, что у него в руках — бэкап, отчёт или инвентаризация.
 * Это вопрос про устройство приложения, а ответ на него целиком лежит внутри
 * файла: и .xlsx, и оба архива — зипы с узнаваемыми именами внутри.
 *
 * Тип определяется по содержимому, дальше работают те же обработчики, что и
 * были: маршрут новый, разбор старый. Разбор бэкапа и отчёта живёт у своих
 * хозяев (`useBackupActions`, `useSettingsPage`) и приходит сюда параметром;
 * своего здесь только маршрут и вливание инвентаризации, которому больше
 * негде быть.
 *
 * Всё тяжёлое грузится в момент нажатия: экран настроек лежит в стартовом
 * графе, а распознавание и разбор архива тянут за собой zip.
 */
export function useImportRouting({
  activeProject,
  notify,
  t,
  handleImportZip,
  handleImportExcel,
}) {
  const handleImportInventory = useCallback(
    async (file) => {
      if (!activeProject?.id) return;

      try {
        notify("info", t("settings.inventoryImportInProgress"), {
          autoCloseMs: 0,
        });
        const [{ importInventoryFile }, { loadComponentRegistry }] =
          await Promise.all([
            import("@/services/inventory/inventoryImport"),
            import("@/configs/projectAdapter"),
          ]);
        const registry = await loadComponentRegistry(activeProject);
        const result = await importInventoryFile(file, activeProject, registry);

        if (!result.added && !result.updated) {
          notify("warning", t("settings.inventoryImportEmpty"));
          return;
        }
        notify(
          "success",
          t("settings.inventoryImported", {
            v1: result.added,
            v2: result.updated,
            v3: result.conflicts,
          }),
        );
        // Карточка, заполненная у железа, важнее строки в таблице, поэтому
        // такие строки не влились — но промолчать о них нельзя.
        if (result.shadowed) {
          notify(
            "warning",
            t("settings.inventoryRowsShadowed", {
              v1: result.shadowed,
            }),
          );
        }
      } catch (error) {
        notify(
          "error",
          `${t("settings.inventoryImportError")}: ${error.message}`,
        );
      }
    },
    [activeProject, notify, t],
  );

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      let kind = "unknown";
      try {
        const { detectImportKind } =
          await import("@/services/import/importRouting");
        ({ kind } = await detectImportKind(file));
      } catch (error) {
        notify("error", `${t("settings.importError")}: ${error.message}`);
        return;
      }

      // Обработчики читают файл из события — им подставляется та же форма,
      // чтобы маршрутизация не потребовала их переписывать.
      const forward = (handler) =>
        handler({ target: { files: [file], value: "" } });

      if (kind === "project") return forward(handleImportZip);
      if (kind === "excel") return forward(handleImportExcel);
      if (kind === "inventory") return handleImportInventory(file);

      notify("error", t("settings.importUnknownFile", { v1: file.name }));
    },
    [handleImportExcel, handleImportInventory, handleImportZip, notify, t],
  );

  return { handleImportFile, handleImportInventory };
}
