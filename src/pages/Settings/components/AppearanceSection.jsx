import { useTheme } from "@/app/hooks/useTheme";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "../Settings.module.scss";

export default function AppearanceSection({ localeTexts, onToggleLanguage }) {
  const { t } = useLanguage();

  const { dark, toggle: toggleTheme } = useTheme();

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.appearanceTitle}</h2>
      </div>

      <div className={s.themeRow}>
        <div className={s.themeInfo}>
          <span className={s.themeLabel}>
            {dark ? localeTexts.themeLabelDark : localeTexts.themeLabelLight}
          </span>
          <span className={s.themeHint}>
            {dark ? localeTexts.themeHintDark : localeTexts.themeHintLight}
          </span>
        </div>
        <button
          className={`${s.themeToggle} ${dark ? s.themeToggleDark : ""}`}
          type="button"
          onClick={toggleTheme}
          aria-label={t("settings.toggleTheme")}
        >
          <span className={s.themeThumb} />
        </button>
      </div>

      <div className={s.themeRow}>
        <div className={s.themeInfo}>
          <span className={s.themeLabel}>{localeTexts.languageLabel}</span>
          <span className={s.themeHint}>{localeTexts.languageHint}</span>
        </div>
        <button
          className={s.languageToggle}
          type="button"
          onClick={onToggleLanguage}
          aria-label={t("settings.toggleLanguageAria")}
        >
          {localeTexts.languageToggleLabel}
        </button>
      </div>
    </section>
  );
}
