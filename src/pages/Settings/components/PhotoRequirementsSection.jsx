import s from "../Settings.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";

function RequirementToggle({ label, hint, checked, onChange }) {
  return (
    <div className={s.photoRequirementRow}>
      <div className={s.themeInfo}>
        <span className={s.themeLabel}>{label}</span>
        <span className={s.themeHint}>{hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`${s.themeToggle} ${checked ? s.themeToggleDark : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={s.themeThumb} />
      </button>
    </div>
  );
}

export default function PhotoRequirementsSection({
  activeProject,
  leakPhotoRequired,
  monitoringPhotoRequired,
  onLeakPhotoRequiredChange,
  onMonitoringPhotoRequiredChange,
}) {
  const { t } = useLanguage();

  if (!activeProject) return null;

  const requiredHint = t("settings.photoRequired");
  const optionalHint = t("settings.photoOptional");

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t("settings.photoRequirements")}</h2>
      </div>
      <div className={s.photoRequirementsBody}>
        <RequirementToggle
          label={t("settings.photoWhenAdding")}
          hint={leakPhotoRequired ? requiredHint : optionalHint}
          checked={leakPhotoRequired}
          onChange={onLeakPhotoRequiredChange}
        />
        <RequirementToggle
          label={t("settings.photoWhenMonitoring")}
          hint={monitoringPhotoRequired ? requiredHint : optionalHint}
          checked={monitoringPhotoRequired}
          onChange={onMonitoringPhotoRequiredChange}
        />
      </div>
    </section>
  );
}
