import { logger } from "@/utils/logger";

export async function handleExport({ leaks, saveFn, onSuccess, onError, t }) {
  try {
    if (!leaks.length) {
      onError?.(t("map.noDataToExport"));
      return;
    }

    if (!saveFn) {
      onError?.(t("map.exportUnavailable"));
      return;
    }

    const result = await saveFn();
    onSuccess?.(result);
  } catch (error) {
    logger.error("[handleExport] Export failed:", error);
    onError?.(t("map.exportError"));
  }
}
