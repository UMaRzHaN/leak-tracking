import s from "./PageHeader.module.scss";

/**
 * Shared app header.
 *
 * Props:
 *  title    — string
 *  subtitle — string (optional, shown below title)
 *  onBack   — function (omit to hide back button)
 *  badge    — string (optional pill in right slot, e.g. "1/3")
 *  right    — ReactNode for right slot
 */
export default function PageHeader({
  title,
  subtitle = /** @type {import("react").ReactNode} */ (null),
  onBack,
  backLabel = "Back",
  badge = /** @type {import("react").ReactNode} */ (null),
  right = /** @type {import("react").ReactNode} */ (null),
}) {
  return (
    <header className={s.appBar}>
      <div className={s.left}>
        {onBack && (
          <button
            className={s.backButton}
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
          >
            ←
          </button>
        )}
      </div>

      <div className={s.titleBlock}>
        <span className={s.title}>{title}</span>
        {subtitle && <span className={s.subtitle}>{subtitle}</span>}
      </div>

      <div className={s.right}>
        {badge && <span className={s.badge}>{badge}</span>}
        {right ?? null}
      </div>
    </header>
  );
}
