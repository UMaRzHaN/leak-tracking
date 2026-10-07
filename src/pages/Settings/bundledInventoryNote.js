import { errorText } from "@/utils/appError";

/**
 * Инвентаризация, приехавшая в одном архиве с отчётом по утечкам, вливается
 * в тот же проект, что и утечки, — после того как они легли. Итог одной
 * строкой: его дописывают к сообщению об утечках, а не показывают вторым —
 * уведомление одно, и второе стёрло бы первое.
 *
 * @param {any} result разбор архива (`bundledInventory` кладёт импорт Excel)
 * @param {any} project проект, куда легли утечки
 * @param {(key: string, params?: any) => string} t
 * @returns {Promise<string>} пустая строка, если инвентаризации не было
 */
export async function importInventoryAlongside(result, project, t) {
  const file = result?.bundledInventory;
  if (!file) return "";
  try {
    const { importBundledInventory } =
      await import("@/services/inventory/bundledInventory");
    const outcome = /** @type {any} */ (
      await importBundledInventory(file, project)
    );
    if (!outcome) return "";
    if (outcome.status === "no-registry") {
      return t("settings.bundledInventoryNoRegistry");
    }
    if (!outcome.added && !outcome.updated) {
      return t("settings.inventoryImportEmpty");
    }
    return t("settings.inventoryImported", {
      v1: outcome.added,
      v2: outcome.updated,
      v3: outcome.conflicts,
    });
  } catch (error) {
    return `${t("settings.inventoryImportError")}: ${errorText(error, t)}`;
  }
}

/** Сообщение об утечках с итогом по инвентаризации, если он есть. */
export function withInventoryNote(message, note) {
  return note ? `${message} ${note}` : message;
}
