import { useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { handleExport } from "@/pages/MapPage/handleExport";

export function useMapExport({
  visibleLeaks,
  projectType,
  projectFolder,
  notify,
  showsComponents = false,
}) {
  const { t } = useLanguage();

  const handleExportKML = useCallback(async () => {
    // Кнопка одна, но выгружает то, что на экране: переключив базу, человек
    // ждёт от неё именно её, а не другую. Файлы разные не только именем —
    // у железа нет скорости утечки, зато есть номер на схеме и состояние.
    const { saveComponentsKML, saveLeaksKML } =
      await import("@/pages/MapPage/kml");
    const save = showsComponents ? saveComponentsKML : saveLeaksKML;

    await handleExport({
      leaks: visibleLeaks,
      saveFn: () => save(visibleLeaks, projectType, projectFolder, t),
      onSuccess: (result) =>
        notify("success", result?.message || t("map.kmlExported")),
      onError: (message) => notify("error", message),
      t,
    });
  }, [visibleLeaks, projectType, projectFolder, notify, showsComponents, t]);

  return { handleExportKML };
}
