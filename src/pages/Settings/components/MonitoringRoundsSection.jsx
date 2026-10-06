import { useLanguage } from "@/app/hooks/useLanguage";
import RequirementToggle from "./SettingsToggle";
import s from "../Settings.module.scss";

/**
 * Мониторинг: можно ли заводить новые обходы. Выключенный переключатель
 * прячет «Новый обход» и «Начать мониторинг» — проверки идут только в
 * текущем обходе, и случайно начать следующий нельзя.
 */
export default function MonitoringRoundsSection({
  activeProject,
  allowNewRounds,
  onChange,
}) {
  const { t } = useLanguage();
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t("settings.rounds.title")}</h2>
      </div>
      <div className={s.photoRequirementsBody}>
        <RequirementToggle
          label={t("settings.rounds.allowNew")}
          hint={
            allowNewRounds
              ? t("settings.rounds.allowedHint")
              : t("settings.rounds.lockedHint")
          }
          checked={allowNewRounds}
          onChange={onChange}
        />
      </div>
    </section>
  );
}
