import { useLanguage } from "@/app/hooks/useLanguage";
import { formatRoundPeriod } from "./monitoringDomain";
import s from "./Monitoring.module.scss";
import o from "./MonitoringRoundOverview.module.scss";

export default function MonitoringRoundOverview({
  round,
  lang,
  texts,
  summary,
  showCompletion,
  hasRound,
  onStartRound,
  onFinishRound,
}) {
  const { t } = useLanguage();

  const isCompleted = Boolean(round?.completedAt);

  return (
    <>
      <header className={s.header}>
        <div>
          {round?.startedAt ? (
            <div className={s.roundMeta}>
              <span className={s.roundBadge}>
                {t("monitoring.roundBadge")} №{round.number ?? 1}
              </span>
              <span className={s.roundSeparator}>·</span>
              <span>
                {formatRoundPeriod(round.startedAt, round.completedAt, lang)}
              </span>
            </div>
          ) : (
            <p>{texts.noActiveRound}</p>
          )}
        </div>
        {!showCompletion && (
          <button
            type="button"
            className={s.newRoundBtn}
            onClick={onStartRound}
          >
            {hasRound ? texts.newRound : texts.startRound}
          </button>
        )}
      </header>

      {showCompletion && (
        <section
          className={`${o.completionCard} ${
            isCompleted ? o.completionCardDone : ""
          }`}
          aria-live="polite"
        >
          <div className={o.completionSummary}>
            <span className={o.completionIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="m7.5 12.5 3 3 6-7" />
              </svg>
            </span>
            <div className={o.completionHeading}>
              <strong>
                {isCompleted ? texts.roundCompleted : texts.roundReady}
              </strong>
              <span>
                {summary.checked}/{summary.total}
              </span>
            </div>
          </div>
          <div className={o.completionStats}>
            <span className={o.completionStat}>
              <i className={o.statOpen} />
              <small>{texts.openResult}</small>
              <strong>{summary.open}</strong>
            </span>
            <span className={o.completionStat}>
              <i className={o.statRepair} />
              <small>{texts.repairResult}</small>
              <strong>{summary.inProgress}</strong>
            </span>
            <span className={o.completionStat}>
              <i className={o.statResolved} />
              <small>{texts.resolvedResult}</small>
              <strong>{summary.resolved}</strong>
            </span>
          </div>
          <button
            type="button"
            className={o.completionAction}
            onClick={isCompleted ? onStartRound : onFinishRound}
          >
            {isCompleted ? texts.newRound : texts.finishRound}
          </button>
        </section>
      )}
    </>
  );
}
