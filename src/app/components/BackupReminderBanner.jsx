import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { getBackupReminderState } from "@/services/storage/backupReminder";
import "@/app/projectDataStatus.scss";

// Проекты, где нажали «Позже», — до перезапуска приложения.
const dismissedProjects = new Set();

/**
 * Напоминание на главной: проект давно не выгружался с устройства.
 *
 * «Позже» убирает его до перезапуска приложения, а не навсегда: напоминание, которое
 * можно выключить одним касанием насовсем, выключат в первый же день.
 */
export default function BackupReminderBanner({ hasData, onOpen }) {
  const { t } = useLanguage();
  const projectId = useProjectData().activeProject?.id ?? null;
  const [dismissedId, setDismissedId] = useState(/** @type {any} */ (null));
  const dismissed = dismissedId === projectId;
  if (!projectId || dismissed || dismissedProjects.has(projectId)) return null;

  const { overdue, daysWithoutBackup } = getBackupReminderState({
    projectId,
    hasData,
  });
  if (!overdue) return null;

  return (
    <section className="dataLoadWarning" role="status" aria-live="polite">
      <span className="dataLoadWarningIcon" aria-hidden="true">
        !
      </span>
      <div className="dataLoadWarningContent">
        <strong>{t("app.backupReminder.title")}</strong>
        <p>
          {t("app.backupReminder.description", { days: daysWithoutBackup })}
        </p>
      </div>
      <div>
        <button type="button" onClick={onOpen}>
          {t("app.backupReminder.open")}
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            dismissedProjects.add(projectId);
            setDismissedId(projectId);
          }}
        >
          {t("app.backupReminder.later")}
        </button>
      </div>
    </section>
  );
}
