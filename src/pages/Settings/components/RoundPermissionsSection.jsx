import { useLanguage } from "@/app/hooks/useLanguage";
import RequirementToggle from "./SettingsToggle";
import s from "../Settings.module.scss";

/**
 * Разрешения обхода вне мониторинга — сверки реестра или обхода ремонтов:
 * новый, его завершение и объединение с предыдущим. Свои у каждого:
 * инвентаризацию, ремонты и обходы утечек ведут разные люди.
 *
 * @param {{
 *   kind: "reconcile"|"repairs",
 *   settings: { allowNew: boolean, allowFinish: boolean, allowMerge: boolean },
 *   onChange: (patch: { allowNew?: boolean, allowFinish?: boolean, allowMerge?: boolean }) => void,
 * }} props
 */
export default function RoundPermissionsSection({ kind, settings, onChange }) {
  const section = kind === "repairs" ? "repairRounds" : "reconcile";
  const { t } = useLanguage();

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t(`settings.${section}.title`)}</h2>
      </div>
      <div className={s.photoRequirementsBody}>
        {[
          ["allowNew", "allowNew", "allowedHint", "lockedHint"],
          [
            "allowFinish",
            "allowFinish",
            "finishAllowedHint",
            "finishLockedHint",
          ],
          ["allowMerge", "allowMerge", "mergeAllowedHint", "mergeLockedHint"],
        ].map(([field, label, allowedHint, lockedHint]) => (
          <RequirementToggle
            key={field}
            label={t(`settings.${section}.${label}`)}
            hint={t(
              `settings.${section}.${settings[field] ? allowedHint : lockedHint}`,
            )}
            checked={settings[field]}
            onChange={(allow) => onChange({ [field]: allow })}
          />
        ))}
      </div>
    </section>
  );
}
