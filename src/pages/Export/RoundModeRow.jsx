import { useLanguage } from "@/app/hooks/useLanguage";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import s from "./ExportPage.module.scss";

const MODES = [
  [EXCEL_MONITORING_EXPORT_MODE.FULL, "export.monitoringFull"],
  [EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND, "export.monitoringLatest"],
];

/**
 * Лист с обходами (8a): все записи или последняя в обходе. Режим — настройка
 * проекта, у каждого листа своя: мониторинг, журнал ремонтов, история сверки.
 *
 * @param {{ label: string, projectId: string|null, storageKeyOf?: (projectId: string) => string }} props
 */
export default function RoundModeRow({ label, projectId, storageKeyOf }) {
  const { t } = useLanguage();
  const { mode, setMode } = useExcelExportMode(projectId, storageKeyOf);

  return (
    <div className={`${s.row} ${s.subRow}`}>
      <span className={s.subLabel}>{label}</span>
      <div className={s.segment} role="radiogroup" aria-label={label}>
        {MODES.map(([value, textKey]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={mode === value ? s.segmentOn : ""}
            onClick={() => setMode(value)}
          >
            {t(textKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
