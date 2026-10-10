import { useLanguage } from "@/app/hooks/useLanguage";
import { getBackupReminderState } from "@/services/storage/backupReminder";
import s from "./BackupStatus.module.scss";

/**
 * Когда проект последний раз уходил с устройства.
 *
 * Стоит прямо под кнопкой экспорта: человек, пришедший сюда, должен видеть,
 * нужен ли бэкап, не вспоминая дату сам.
 */
export default function BackupStatus({ projectId, hasData }) {
  const { t, lang } = useLanguage();
  const { lastBackupAt, overdue, daysWithoutBackup } = getBackupReminderState({
    projectId,
    hasData,
  });

  const text = overdue
    ? t("settings.backupStatus.overdue", { days: daysWithoutBackup })
    : lastBackupAt
      ? t("settings.backupStatus.last", {
          date: new Date(lastBackupAt).toLocaleString(lang),
        })
      : t("settings.backupStatus.never");

  return (
    <p
      className={overdue ? s.backupStatusOverdue : s.backupStatus}
      role={overdue ? "alert" : undefined}
    >
      {text}
    </p>
  );
}
