import { errorText } from "@/utils/appError";
import { useCallback, useState } from "react";
import { STATUS, getStatusLabel } from "@/utils/status";
import { useEffectiveProjectConfig } from "@/app/project/hooks/useEffectiveProjectConfig";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { readProjectSettings } from "@/app/project/projectSettings";
import { readMonitoringRound } from "@/utils/monitoringRound";
import { readProjectSyncStateAsync } from "@/services/sync/projectSyncState";
import { formatTimeOfDay } from "@/services/excelExport/cellValues";
import { getLeakSheetValue } from "@/services/excelExport/leakSheetValues";
import { getStatusRepairMilestones } from "@/domain/leakEvents";

// Timestamps leave here raw — as numbers, not as text. They used to be run
// through Intl first and parsed back into dates by the Excel layer, and that
// round trip lost information: with an English interface Intl writes 9 October
// as `10/09/2026`, the parser reads the leading number as the day, and the
// export silently reported 10 September. Every date whose day was 12 or lower
// swapped its day and month. Nothing needs the text form anyway — the column
// carries a date format, so Excel renders it in the viewer's own locale.
export function prepareRows(data, t, projectVars = {}) {
  return data.map((row) => {
    // Дата со временем и снимок ремонта и устранения — по статусу, как в
    // карточке: у записи в ремонте — момент и снимок перехода в ремонт, у
    // устранённой — ещё и устранения. Переход делает и починка, и осмотр.
    const milestones = getStatusRepairMilestones(row);
    const hasPhoto = (path) => (path ? t("database.export.hasPhoto") : "");
    return {
      ...row,
      gasPercentage: getLeakSheetValue("gasPercentage", row, projectVars),
      status: getStatusLabel(row.status ?? STATUS.OPEN, t),
      date: row.date ?? (row.created_at ? Number(row.created_at) : ""),
      Total_Annual_Methane_Loss_m3_y: getLeakSheetValue(
        "Total_Annual_Methane_Loss_m3_y",
        row,
      ),
      Emissions_t_CO2eq_year: getLeakSheetValue("Emissions_t_CO2eq_year", row),
      photo: hasPhoto(row.photo),
      photo_after: hasPhoto(milestones.resolvedPhoto),
      photo_repair: hasPhoto(milestones.repairPhoto),
      repairAt: milestones.repairAt ?? "",
      repairTime: formatTimeOfDay(milestones.repairAt),
      resolvedAt: milestones.resolvedAt ?? "",
      resolvedTime: formatTimeOfDay(milestones.resolvedAt),
    };
  });
}

export function useDataBaseExport({ displayed, notify }) {
  const { t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const projectConfig = useEffectiveProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } =
    projectConfig.export.excel;
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const { activeProject } = useProjectData();
  const { monitoringExportMode } = useExcelExportMode(
    activeProject?.id ?? null,
  );
  const { vars } = useProjectVars(activeProject?.id ?? null);

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    try {
      setIsExporting(true);
      notify("info", t("database.exportInProgress"), { autoCloseMs: 0 });

      /*
       * Здесь только утечки. Реестр, его снимки и чертежи ездили в этом же
       * архиве, пока другого не было; теперь инвентаризация выгружается своим
       * архивом со своей страницы. Отчёт по утечкам отдают тем, кто считает
       * выбросы, и класть им в него чужую работу — значит заставлять
       * получателя разбираться, что из этого его.
       */
      const [{ exportToExcelFile }, { buildWorkbookBufferInWorker }] =
        await Promise.all([
          import("@/pages/DataBase/excel"),
          import("@/services/excel/excelWorkerClient"),
        ]);

      const result = await exportToExcelFile(
        displayed,
        prepareRows(displayed, t, vars),
        excelHeaders,
        excelKeys,
        `!Database_${activeProject?.name || "no_name"}`,
        idbGetPhoto,
        activeProject?.folderName,
        t,
        {
          monitoringExportMode,
          project: activeProject,
          vars,
          settings: readProjectSettings(activeProject?.id),
          monitoringRound: readMonitoringRound(activeProject?.id),
          sync: await readProjectSyncStateAsync(activeProject?.id),
          // A filtered export must be self-contained without silently
          // including records (and photos) hidden by the current filters.
          backupLeaks: displayed,
          buildWorkbookBuffer: buildWorkbookBufferInWorker,
        },
      );

      if (typeof window !== "undefined") {
        window.__EXCEL_EXPORT_METRICS__ = result?.metrics ?? null;
      }
      notify("success", result?.message || t("database.export.success"));
    } catch (err) {
      notify(
        "error",
        t("database.export.error", { message: errorText(err, t) }),
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    activeProject,
    displayed,
    excelHeaders,
    excelKeys,
    idbGetPhoto,
    isExporting,
    monitoringExportMode,
    notify,
    t,
    vars,
  ]);

  return { handleExport, isExporting };
}
