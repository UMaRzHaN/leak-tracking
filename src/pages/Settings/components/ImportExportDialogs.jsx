import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import { useLanguage } from "@/app/hooks/useLanguage";
import ImportConflictSheet from "@/features/importConflict/ImportConflictSheet";

function formatExcelValidationSummary(result, t) {
  const count = result?.stats?.validationWarningCount ?? 0;
  if (!count) return "";
  const examples = (result.stats.validationWarnings ?? [])
    .slice(0, 3)
    .map((warning) =>
      t("settings.importWarningLine", {
        sheet: warning.sheet,
        row: warning.row,
        column: warning.column,
        message: warning.message,
      }),
    )
    .join("; ");
  const prefix = t("settings.validationWarnings", { count });
  return examples ? `${prefix} ${examples}` : prefix;
}

export default function ImportExportDialogs({
  backupConflict,
  excelConflict,
  excelImport,
  importConfirm,
}) {
  const { t } = useLanguage();

  return (
    <>
      <ImportConflictSheet
        open={backupConflict.state.open}
        projectName={backupConflict.state.resolvedName}
        existingProject={backupConflict.state.existingProject}
        leakCount={backupConflict.state.leakCount}
        mergePreview={backupConflict.state.mergePreview}
        registryPreview={backupConflict.state.registryPreview}
        onOverwrite={backupConflict.onOverwrite}
        onMerge={backupConflict.onMerge}
        onCopy={backupConflict.onCopy}
        onCancel={backupConflict.onCancel}
      />

      <ImportConflictSheet
        open={excelConflict.state.open}
        projectName={excelConflict.state.projectName}
        existingProject={excelConflict.state.existingProject}
        leakCount={excelConflict.state.leakCount}
        mergePreview={excelConflict.state.mergePreview}
        sourceLabel={t("settings.inExcel")}
        photoLabel={t("settings.excelPhotos")}
        onOverwrite={excelConflict.onOverwrite}
        onMerge={excelConflict.onMerge}
        onCopy={excelConflict.onCopy}
        onCancel={excelConflict.onCancel}
      />

      <ConfirmSheet
        open={importConfirm.state.open}
        title={importConfirm.state.title}
        description={importConfirm.state.description}
        confirmLabel={importConfirm.state.confirmLabel}
        cancelLabel={importConfirm.state.cancelLabel}
        onConfirm={importConfirm.onConfirm}
        onCancel={importConfirm.onCancel}
      />

      <ConfirmSheet
        open={excelImport.state.open}
        title={t("settings.importExcelTitle")}
        description={
          excelImport.state.result
            ? t("settings.importExcelDescription", {
                fileName: excelImport.state.fileName,
                sheetName: excelImport.state.result.sheetName,
                totalRows: excelImport.state.result.stats.totalRows,
                imported: excelImport.state.result.stats.imported,
                monitoring:
                  excelImport.state.result.stats.monitoringRecords ?? 0,
                photos: excelImport.state.result.stats.restoredPhotos ?? 0,
                skipped: excelImport.state.result.stats.skipped,
                warnings: formatExcelValidationSummary(
                  excelImport.state.result,
                  t,
                ),
              })
            : ""
        }
        confirmLabel={t("settings.importAction")}
        cancelLabel={t("settings.cancel")}
        onConfirm={excelImport.onConfirm}
        onCancel={excelImport.onCancel}
      />
    </>
  );
}
