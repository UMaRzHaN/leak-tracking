import s from "./PageHeader.module.scss";

/**
 * Shared page header with back button, title, and optional right slot.
 *
 * Props:
 *  title      — string
 *  onBack     — function, if omitted back button is hidden
 *  right      — ReactNode for right slot (e.g. VoiceButton)
 */
export default function PageHeader({ title, onBack, right }) {
  return (
    <header className={s.appBar}>
      <div className={s.left}>
        {onBack && (
          <button className={s.backButton} type="button" onClick={onBack}>
            ←
          </button>
        )}
      </div>

      <div className={s.center}>
        <span className={s.title}>{title}</span>
      </div>

      <div className={s.right}>{right ?? null}</div>
    </header>
  );
}
