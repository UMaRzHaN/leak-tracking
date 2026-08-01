import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import ImportConflictSheet from "@/features/importConflict/ImportConflictSheet";

function formatExcelValidationSummary(result, lang) {
  const count = result?.stats?.validationWarningCount ?? 0;
  if (!count) return "";
  const examples = (result.stats.validationWarnings ?? [])
    .slice(0, 3)
    .map((warning) =>
      lang === "ru"
        ? `${warning.sheet}, строка ${warning.row}, ${warning.column}: ${warning.message}`
        : `${warning.sheet}, row ${warning.row}, ${warning.column}: ${warning.message}`,
    )
    .join("; ");
  const prefix =
    lang === "ru"
      ? ` Предупреждения валидации: ${count}.`
      : ` Validation warnings: ${count}.`;
  return examples ? `${prefix} ${examples}` : prefix;
}

export default function ImportExportDialogs({
  backupConflict,
  excelConflict,
  excelImport,
  importConfirm,
  lang,
}) {
  return (
    <>
      <ImportConflictSheet
        open={backupConflict.state.open}
        projectName={backupConflict.state.resolvedName}
        existingProject={backupConflict.state.existingProject}
        leakCount={backupConflict.state.leakCount}
        mergePreview={backupConflict.state.mergePreview}
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
        sourceLabel={lang === "ru" ? "в Excel" : "in Excel"}
        photoLabel={lang === "ru" ? "Фото Excel" : "Excel photos"}
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
        title={lang === "ru" ? "Импортировать Excel?" : "Import Excel?"}
        description={
          excelImport.state.result
            ? lang === "ru"
              ? `Файл: ${excelImport.state.fileName}. Лист: ${excelImport.state.result.sheetName}. Найдено строк: ${excelImport.state.result.stats.totalRows}; будет импортировано: ${excelImport.state.result.stats.imported}; мониторинг: ${excelImport.state.result.stats.monitoringRecords ?? 0}; фото: ${excelImport.state.result.stats.restoredPhotos ?? 0}; пропущено: ${excelImport.state.result.stats.skipped}.${formatExcelValidationSummary(excelImport.state.result, lang)}`
              : `File: ${excelImport.state.fileName}. Sheet: ${excelImport.state.result.sheetName}. Rows found: ${excelImport.state.result.stats.totalRows}; to import: ${excelImport.state.result.stats.imported}; monitoring: ${excelImport.state.result.stats.monitoringRecords ?? 0}; photos: ${excelImport.state.result.stats.restoredPhotos ?? 0}; skipped: ${excelImport.state.result.stats.skipped}.${formatExcelValidationSummary(excelImport.state.result, lang)}`
            : ""
        }
        confirmLabel={lang === "ru" ? "Импортировать" : "Import"}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        onConfirm={excelImport.onConfirm}
        onCancel={excelImport.onCancel}
      />
    </>
  );
}
