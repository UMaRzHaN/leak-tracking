import { logger } from "@/utils/logger";

export async function handleExport({
  leaks,
  saveFn,
  onSuccess,
  onError,
  lang = "ru",
}) {
  try {
    if (!leaks.length) {
      onError?.(
        lang === "ru" ? "Нет данных для экспорта" : "No data to export",
      );
      return;
    }

    if (!saveFn) {
      onError?.(
        lang === "ru"
          ? "Экспорт недоступен для этого проекта"
          : "Export is not available for this project",
      );
      return;
    }

    const result = await saveFn();
    onSuccess?.(result);
  } catch (error) {
    logger.error("[handleExport] Export failed:", error);
    onError?.(lang === "ru" ? "Ошибка экспорта" : "Export error");
  }
}
