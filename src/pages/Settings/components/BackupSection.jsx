import s from "../Settings.module.scss";

export default function BackupSection({
  activeProject,
  importZipRef,
  isExporting = false,
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
            disabled={isExporting}
          >
            {isExporting ? "Экспорт..." : localeTexts.exportZip}
          </button>
          <button
            className={`${s.backupBtn} ${s.restore}`}
            type="button"
            onClick={() => importZipRef.current?.click()}
            disabled={isExporting}
          >
            {localeTexts.importZip}
          </button>
        </div>
        <p className={s.backupHint}>{localeTexts.backupHint}</p>
      </div>

      <input
        ref={importZipRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: "none" }}
        onChange={onImport}
      />
    </section>
  );
}
