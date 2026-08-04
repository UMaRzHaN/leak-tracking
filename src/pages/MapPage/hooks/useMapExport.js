import { useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { handleExport } from "@/pages/MapPage/handleExport";

export function useMapExport({
  visibleLeaks,
  projectType,
  projectFolder,
  notify,
}) {
  const { t } = useLanguage();

  const handleExportKML = useCallback(async () => {
    const { saveLeaksKML } = await import("@/pages/MapPage/kml");

    await handleExport({
      leaks: visibleLeaks,
      saveFn: () => saveLeaksKML(visibleLeaks, projectType, projectFolder, t),
      onSuccess: (result) =>
        notify("success", result?.message || t("map.kmlExported")),
      onError: (message) => notify("error", message),
      t,
    });
  }, [visibleLeaks, projectType, projectFolder, notify, t]);

  return { handleExportKML };
}
