import { useCallback, useState } from "react";
import { STATUS, getStatusLabel } from "@/utils/status";
import { useEffectiveProjectConfig } from "@/app/project/hooks/useEffectiveProjectConfig";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { useProjectData } from "@/app/project/ProjectContext";
import { useLanguage } from "@/app/hooks/useLanguage";
import { formatDate } from "@/utils/locale";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";

function fmtTs(ts, lang) {
  if (!ts) return "";

  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "";

  return formatDate(
    date,
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
    lang,
  );
}

function getRepairAt(row) {
  if (row.repairAt) return row.repairAt;

  const repairEntry = [...(row.history ?? [])]
    .reverse()
    .find(
      (entry) =>
        entry?.action === "status_changed" && entry?.to === STATUS.IN_PROGRESS,
    );

  return repairEntry?.date ?? null;
}

function round2(value) {
  return value != null && Number.isFinite(Number(value))
    ? Math.round(Number(value) * 100) / 100
    : value;
}

function prepareRows(data, lang, t) {
  return data.map((row) => ({
    ...row,
    status: getStatusLabel(row.status ?? STATUS.OPEN, t),
    date:
      row.date ??
      (row.created_at ? formatDate(Number(row.created_at), {}, lang) : ""),
    Total_Annual_Methane_Loss_m3_y: round2(row.Total_Annual_Methane_Loss_m3_y),
    Emissions_t_CO2eq_year: round2(row.Emissions_t_CO2eq_year),
    photo: row.photo
      ? t("database.export.hasPhoto", { defaultValue: "Yes" })
      : "",
    photo_after: row.photo_after
      ? t("database.export.hasPhoto", { defaultValue: "Yes" })
      : "",
    photo_repair: row.photo_repair
      ? t("database.export.hasPhoto", { defaultValue: "Yes" })
      : "",
    repairAt: fmtTs(getRepairAt(row), lang),
    resolvedAt: fmtTs(row.resolvedAt, lang),
  }));
}

export function useDataBaseExport({ displayed, notify }) {
  const { lang, t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const projectConfig = useEffectiveProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } =
    projectConfig.export.excel;
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const { activeProject } = useProjectData();
  const { monitoringExportMode } = useExcelExportMode(
    activeProject?.id ?? null,
  );

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    try {
      setIsExporting(true);
      notify(
        "info",
        lang === "ru"
          ? "Идёт экспорт, подождите..."
          : "Export in progress, please wait...",
        { autoCloseMs: 0 },
      );

      const { exportToExcelFile } = await import("@/pages/DataBase/excel");
      const result = await exportToExcelFile(
        displayed,
        prepareRows(displayed, lang, t),
        excelHeaders,
        excelKeys,
        `!Database_${activeProject?.name || "no_name"}`,
        idbGetPhoto,
        activeProject?.folderName,
        lang,
        { monitoringExportMode, project: activeProject },
      );

      notify(
        "success",
        result?.message ||
          t("database.export.success", {
            defaultValue: "ZIP archive downloaded successfully",
          }),
      );
    } catch (err) {
      notify(
        "error",
        t("database.export.error", {
          defaultValue: `Export error: ${err.message}`,
        }),
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
    lang,
    monitoringExportMode,
    notify,
    t,
  ]);

  return { handleExport, isExporting };
}
