import s from "../Settings.module.scss";

function IssueRow({ label, values }) {
  return (
    <div className={s.integrityIssue}>
      <span>{label}</span>
      <strong>{values.length}</strong>
      {values.length > 0 && <small>{values.slice(0, 5).join(", ")}</small>}
    </div>
  );
}

export default function ProjectIntegritySection({
  activeProject,
  lang,
  report,
  checking,
  onCheck,
}) {
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>
            {lang === "ru" ? "Проверка данных" : "Data Check"}
          </h2>
          <p className={s.sectionHint}>
            {lang === "ru"
              ? "Ищет пропущенные фото, битые ссылки, координаты и дубли ID."
              : "Finds missing photos, broken links, coordinates, and duplicate IDs."}
          </p>
        </div>
        <button
          className={s.cacheBtn}
          type="button"
          onClick={onCheck}
          disabled={checking}
        >
          {checking
            ? lang === "ru"
              ? "Проверка..."
              : "Checking..."
            : lang === "ru"
              ? "Проверить"
              : "Check"}
        </button>
      </div>

      {report && (
        <div className={s.integrityReport}>
          <div className={report.ok ? s.integrityOk : s.integrityWarn}>
            {report.ok
              ? lang === "ru"
                ? `Проблем не найдено (${report.total} записей)`
                : `No issues found (${report.total} records)`
              : lang === "ru"
                ? `Найдено проблем: ${report.issues}`
                : `Issues found: ${report.issues}`}
          </div>
          {!report.ok && (
            <div className={s.integrityGrid}>
              <IssueRow
                label={lang === "ru" ? "Без фото" : "No photo"}
                values={report.missingPhoto}
              />
              <IssueRow
                label={lang === "ru" ? "Битые фото" : "Broken photos"}
                values={report.brokenPhoto}
              />
              <IssueRow
                label={lang === "ru" ? "Без координат" : "No coordinates"}
                values={report.missingCoords}
              />
              <IssueRow
                label={lang === "ru" ? "Дубли leak_id" : "Duplicate leak_id"}
                values={report.duplicateLeakIds}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
