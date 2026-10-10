import s from "../Settings.module.scss";

/** Строка настройки с переключателем: подпись, пояснение и switch. */
export default function RequirementToggle({ label, hint, checked, onChange }) {
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
