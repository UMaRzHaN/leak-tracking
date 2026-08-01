import { useCallback } from "react";
import { handleExport } from "@/pages/MapPage/handleExport";

export function useMapExport({
  visibleLeaks,
  projectType,
  projectFolder,
  notify,
  lang,
}) {
  const handleExportKML = useCallback(async () => {
    const { saveLeaksKML } = await import("@/pages/MapPage/kml");

    await handleExport({
      leaks: visibleLeaks,
      saveFn: () =>
        saveLeaksKML(visibleLeaks, projectType, projectFolder, lang),
      onSuccess: (result) =>
        notify(
          "success",
          result?.message ||
            (lang === "ru"
              ? "KML-файл успешно экспортирован"
              : "KML file exported successfully"),
        ),
      onError: (message) => notify("error", message),
      lang,
    });
  }, [visibleLeaks, projectType, projectFolder, notify, lang]);

  return { handleExportKML };
}
