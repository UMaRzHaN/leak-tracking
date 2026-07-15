import s from "../Settings.module.scss";

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
  lang,
  leakPhotoRequired,
  monitoringPhotoRequired,
  onLeakPhotoRequiredChange,
  onMonitoringPhotoRequiredChange,
}) {
  if (!activeProject) return null;

  const requiredHint =
    lang === "ru"
      ? "Без фото сохранить нельзя."
      : "Cannot save without a photo.";
  const optionalHint =
    lang === "ru"
      ? "Фото можно добавить по желанию."
      : "The photo is optional.";

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>
          {lang === "ru" ? "Требования к фото" : "Photo requirements"}
        </h2>
      </div>
      <div className={s.photoRequirementsBody}>
        <RequirementToggle
          label={lang === "ru" ? "При добавлении утечки" : "When adding a leak"}
          hint={leakPhotoRequired ? requiredHint : optionalHint}
          checked={leakPhotoRequired}
          onChange={onLeakPhotoRequiredChange}
        />
        <RequirementToggle
          label={lang === "ru" ? "При мониторинге" : "During monitoring"}
          hint={monitoringPhotoRequired ? requiredHint : optionalHint}
          checked={monitoringPhotoRequired}
          onChange={onMonitoringPhotoRequiredChange}
        />
      </div>
    </section>
  );
}
