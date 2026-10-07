import { useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { handleExport } from "@/pages/MapPage/handleExport";

export function useMapExport({
  visibleLeaks,
  projectType,
  projectFolder,
  notify,
  showsComponents = false,
  // Раскладка файла по смыслу карты: "leaks" | "monitoring" | "repairs".
  mode = "leaks",
}) {
  const { t } = useLanguage();

  const handleExportKML = useCallback(async () => {
    // Кнопка одна, но выгружает то, что на экране: переключив базу, человек
    // ждёт от неё именно её, а не другую. Файлы разные не только именем —
    // у железа нет скорости утечки, зато есть номер на схеме и состояние.
    const { saveComponentsKML, saveLeaksKML } =
      await import("@/pages/MapPage/kml");

    await handleExport({
      leaks: visibleLeaks,
      saveFn: () =>
        showsComponents
          ? saveComponentsKML(visibleLeaks, projectType, projectFolder, t)
          : saveLeaksKML(visibleLeaks, projectType, projectFolder, t, mode),
      onSuccess: (result) =>
        notify("success", result?.message || t("map.kmlExported")),
      onError: (message) => notify("error", message),
      t,
    });
  }, [
    visibleLeaks,
    projectType,
    projectFolder,
    notify,
    showsComponents,
    mode,
    t,
  ]);

  return { handleExportKML };
}
