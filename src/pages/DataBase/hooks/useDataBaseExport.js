import { useCallback } from "react";
import { STATUS, STATUS_META } from "../../../utils/status";
import { exportToExcelZip } from "../../../services/export/excel";
import { useProjectConfig } from "../../../app/settings/useProjectConfig";
import { usePhotoStorage } from "../../../hooks/usePhotoStorage";
import { useProject } from "../../../app/settings/ProjectContext";

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function round2(v) {
  return v != null && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : v;
}

function prepareRows(data) {
  return data.map((r) => ({
    ...r,
    status: STATUS_META[r.status ?? STATUS.OPEN]?.label ?? r.status ?? "",
    date: r.date ?? (r.created_at ? new Date(Number(r.created_at)).toLocaleDateString("ru-RU") : ""),
    Total_Annual_Methane_Loss_m3_y: round2(r.Total_Annual_Methane_Loss_m3_y),
    Emissions_t_CO2eq_year: round2(r.Emissions_t_CO2eq_year),
    photo: r.photo ? "Есть" : "",
    photo_after: r.photo_after ? "Есть" : "",
    resolvedAt: fmtTs(r.resolvedAt),
  }));
}

export function useDataBaseExport({ displayed, notify }) {
  const projectConfig = useProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } = projectConfig.export.excel;
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const { activeProject } = useProject();

  const handleExport = useCallback(async () => {
    try {
      await exportToExcelZip(
        displayed,
        prepareRows(displayed),
        excelHeaders,
        excelKeys,
        "утечки",
        idbGetPhoto,
        activeProject?.folderName,
      );
      notify("success", "ZIP-архив успешно скачан");
    } catch (err) {
      notify("error", "Ошибка экспорта: " + err.message);
    }
  }, [displayed, excelHeaders, excelKeys, idbGetPhoto, activeProject?.folderName, notify]);

  return { handleExport };
}
