import { useLanguage } from "@/app/hooks/useLanguage";
import RequirementToggle from "./SettingsToggle";
import s from "../Settings.module.scss";

/**
 * Мониторинг: можно ли заводить новые обходы, завершать текущий и
 * объединять его с предыдущим. Выключенный переключатель прячет свою кнопку —
 * «Новый обход» и «Начать мониторинг», «Завершить обход» или «Объединить с
 * № N», — и случайно нажать её нельзя.
 */
export default function MonitoringRoundsSection({
  activeProject,
  allowNewRounds,
  onChange,
  allowFinishRounds,
  onFinishChange,
  allowMergeRounds,
  onMergeChange,
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
        <RequirementToggle
          label={t("settings.rounds.allowFinish")}
          hint={
            allowFinishRounds
              ? t("settings.rounds.finishAllowedHint")
              : t("settings.rounds.finishLockedHint")
          }
          checked={allowFinishRounds}
          onChange={onFinishChange}
        />
        <RequirementToggle
          label={t("settings.rounds.allowMerge")}
          hint={
            allowMergeRounds
              ? t("settings.rounds.mergeAllowedHint")
              : t("settings.rounds.mergeLockedHint")
          }
          checked={allowMergeRounds}
          onChange={onMergeChange}
        />
      </div>
    </section>
  );
}
