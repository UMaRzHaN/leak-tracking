import { errorCode, errorText } from "@/utils/appError";
import { useCallback } from "react";
import { projectNameFromFile } from "@/services/import/projectNameFromFile";

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
  onImportInventory,
}) {
  const handleImportInventory = useCallback(
    async (file) => {
      if (!activeProject?.id) return;

      try {
        const [
          { importInventoryFile },
          { hasComponentRegistry, componentRegistryProjectTypes },
          { loadComponentRegistry },
        ] = await Promise.all([
          import("@/services/inventory/inventoryImport"),
          import("@/configs/componentRegistry.config"),
          import("@/configs/projectAdapter"),
        ]);

        // Реестр ведут не все типы проектов, а кнопка импорта одна на всех:
        // человек приносит архив инвентаризации в проект, которому его некуда
        // положить. Спрашивать тут не о чем — ни одного решения человек
        // принять не может: тип, ведущий реестр, приложение знает само, а имя
        // написано на файле. Поэтому архив заводит себе проект, ровно как на
        // первом экране, и вливается уже в него.
        if (!hasComponentRegistry(activeProject)) {
          if (!onImportInventory) {
            notify(
              "error",
              t("settings.inventoryImportNoRegistry", {
                v1: componentRegistryProjectTypes()
                  .map((type) => t(`settings.projectTypes.${type}`))
                  .join(", "),
              }),
            );
            return;
          }

          notify("info", t("settings.inventoryImportInProgress"), {
            autoCloseMs: 0,
          });
          const created = await onImportInventory(file, {
            name: projectNameFromFile(file.name),
          });
          notify(
            "success",
            t("settings.inventoryImportedIntoNewProject", {
              v1: created?.project?.name ?? "",
              v2: created?.components ?? 0,
            }),
          );
          return;
        }

        notify("info", t("settings.inventoryImportInProgress"), {
          autoCloseMs: 0,
        });
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
        // Пустой архив — не поломка разбора, а «в файле ничего нет»: заведение
        // проекта отдаёт это кодом, и здесь оно должно звучать так же, как
        // при вливании в открытый проект.
        if (errorCode(error) === "EMPTY_INVENTORY") {
          notify("warning", t("settings.inventoryImportEmpty"));
          return;
        }
        notify(
          "error",
          `${t("settings.inventoryImportError")}: ${errorText(error, t)}`,
        );
      }
    },
    [activeProject, notify, onImportInventory, t],
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
        notify("error", `${t("settings.importError")}: ${errorText(error, t)}`);
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
