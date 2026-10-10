import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MainPage/MainPage.module.scss";

/**
 * Охват обследования (2b) на месте прежних плиток-фильтров. Считается по
 * тому, что уже есть в проекте (`computeSurveyCoverage`); переход «По
 * категориям объектов» появится вместе с вводом «Обследовано без утечек».
 */
export default function CoverageCard({
  coverage,
  onOpen = /** @type {(() => void)|null} */ (null),
}) {
  const { t } = useLanguage();
  const {
    surveyed,
    total,
    percent,
    estimated = false,
    projectWide = false,
  } = coverage;

  return (
    <section className={s.coverage} aria-label={t("mainPage.coverage.title")}>
      <div className={s.coverageHead}>
        <h2 className={s.coverageTitle}>{t("mainPage.coverage.title")}</h2>
        <span className={s.coverageValue}>
          {total === null
            ? surveyed
            : t(
                estimated
                  ? "mainPage.coverage.estimated"
                  : "mainPage.coverage.value",
                {
                  surveyed,
                  total,
                  percent,
                },
              )}
        </span>
      </div>
      {total !== null && (
        <span
          className={s.coverageBar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
      {projectWide && (
        <p className={s.coverageHint}>{t("mainPage.coverage.projectWide")}</p>
      )}
      {estimated ? null : (
        <p className={s.coverageHint}>
          {t(
            total === null
              ? "mainPage.coverage.noRegistry"
              : "mainPage.coverage.hint",
          )}
        </p>
      )}
      {onOpen && (
        <button type="button" className={s.coverageLink} onClick={onOpen}>
          {t("mainPage.coverage.open")} ›
        </button>
      )}
    </section>
  );
}
