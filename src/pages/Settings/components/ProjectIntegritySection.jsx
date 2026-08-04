import s from "../Settings.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";

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
  report,
  checking,
  onCheck,
}) {
  const { t } = useLanguage();

  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>{t("settings.integrityTitle")}</h2>
          <p className={s.sectionHint}>{t("settings.integrityDescription")}</p>
        </div>
        <button
          className={s.cacheBtn}
          type="button"
          onClick={onCheck}
          disabled={checking}
        >
          {checking
            ? t("settings.integrityChecking")
            : t("settings.integrityCheck")}
        </button>
      </div>

      {report && (
        <div className={s.integrityReport}>
          <div className={report.ok ? s.integrityOk : s.integrityWarn}>
            {report.ok
              ? t("settings.integrityNoIssues", { total: report.total })
              : t("settings.integrityIssues", { issues: report.issues })}
          </div>
          {!report.ok && (
            <div className={s.integrityGrid}>
              <IssueRow
                label={t("settings.integrityNoPhoto")}
                values={report.missingPhoto}
              />
              <IssueRow
                label={t("settings.integrityNoRepairPhoto")}
                values={report.missingRepairPhoto ?? []}
              />
              <IssueRow
                label={t("settings.integrityNoAfterPhoto")}
                values={report.missingAfterPhoto ?? []}
              />
              <IssueRow
                label={t("settings.integrityNoMonitoringPhoto")}
                values={report.missingMonitoringPhoto ?? []}
              />
              <IssueRow
                label={t("settings.integrityBrokenPhotos")}
                values={report.brokenPhoto}
              />
              <IssueRow
                label={t("settings.integrityNoCoordinates")}
                values={report.missingCoords}
              />
              <IssueRow
                label={t("settings.integrityDuplicateLeakId")}
                values={report.duplicateLeakIds}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
