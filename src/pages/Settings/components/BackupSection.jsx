import s from "../Settings.module.scss";

export default function BackupSection({
  activeProject,
  importRef,
  isExporting = false,
  isImportingExcel = false,
  localeTexts,
  onExport,
  onImport,
}) {
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.backup}</h2>
      </div>
      <div className={s.backupBody}>
        <div className={s.backupRow}>
          <button
            className={s.backupBtn}
            type="button"
            onClick={onExport}
            disabled={isExporting || isImportingExcel}
          >
            {isExporting ? localeTexts.exportZipLoading : localeTexts.exportZip}
          </button>
          {/* Одна кнопка на все форматы: бэкап, отчёт и инвентаризация
              различаются по содержимому файла, а не по тому, что человек
              вспомнил про свой архив. */}
          <button
            className={`${s.backupBtn} ${s.restore}`}
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={isExporting || isImportingExcel}
          >
            {isImportingExcel
              ? localeTexts.importExcelLoading
              : localeTexts.importFile}
          </button>
        </div>
        <p className={s.backupHint}>{localeTexts.backupHint}</p>
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".xlsx,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
        style={{ display: "none" }}
        onChange={onImport}
      />
    </section>
  );
}
