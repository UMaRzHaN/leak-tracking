import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useExcelExportMode } from "@/app/project/hooks/useExcelExportMode";
import { useModalDialog } from "@/hooks/useModalDialog";
import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import Icon from "@/components/ui/Icon/Icon";
import sheet from "@/components/ui/ConfirmSheet/ConfirmSheet.module.scss";
import s from "./ExportPage.module.scss";

const MODES = [
  {
    value: EXCEL_MONITORING_EXPORT_MODE.FULL,
    label: "export.monitoringFull",
    hint: "export.roundMode.fullHint",
  },
  {
    value: EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND,
    label: "export.monitoringLatest",
    hint: "export.roundMode.latestHint",
  },
];

/** Выбранный режим подписью под названием листа — видно и без окна. */
export function RoundModeCaption({ projectId, storageKeyOf, className }) {
  const { t } = useLanguage();
  const { mode } = useExcelExportMode(projectId, storageKeyOf);
  const current = MODES.find((item) => item.value === mode) ?? MODES[0];
  return <span className={className}>{t(current.label)}</span>;
}

/**
 * Записи обхода в листе (8a): «⋯» у строки листа открывает выбор — все
 * записи или последняя в обходе, с пояснением, чем они отличаются. Режим —
 * настройка проекта, у каждого листа своя.
 *
 * @param {{ label: string, projectId: string|null, storageKeyOf?: (projectId: string) => string }} props
 */
export default function RoundModeButton({ label, projectId, storageKeyOf }) {
  const { t } = useLanguage();
  const { mode, setMode } = useExcelExportMode(projectId, storageKeyOf);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useModalDialog({ open, onClose: () => setOpen(false) });
  const title = t("export.roundMode.title", { sheet: label });

  return (
    <>
      <button
        type="button"
        className={s.moreButton}
        aria-label={title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="more" size={18} />
      </button>

      {open && (
        <div className={sheet.overlay} onClick={() => setOpen(false)}>
          <div
            ref={dialogRef}
            className={sheet.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={sheet.handle} />
            <h3 id={titleId} className={sheet.title}>
              {title}
            </h3>
            <div className={s.modeOptions} role="radiogroup" aria-label={label}>
              {MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === item.value}
                  className={
                    mode === item.value ? s.modeOptionOn : s.modeOption
                  }
                  onClick={() => {
                    setMode(item.value);
                    setOpen(false);
                  }}
                >
                  <strong>{t(item.label)}</strong>
                  <span>{t(item.hint)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
