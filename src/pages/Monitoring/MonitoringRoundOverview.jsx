import { useLanguage } from "@/app/hooks/useLanguage";
import { formatRoundPeriod } from "./monitoringDomain";
import s from "./Monitoring.module.scss";

/**
 * Шапка обхода: номер, период, «Объединить с № N−1», «Новый обход» и
 * карточка завершения. Ею же пользуется сверка реестра — со своим словом в
 * номере («Сверка № 2»), своей ссылкой объединения и своей статистикой.
 */
export default function MonitoringRoundOverview({
  round,
  lang,
  texts,
  summary,
  showCompletion,
  hasRound,
  onStartRound,
  onFinishRound,
  // Настройка проекта: выключенное завершение прячет кнопку.
  canFinishRound = true,
  onMergeRound = /** @type {(() => void)|null} */ (null),
  // Новые обходы выключены в настройках: кнопок нового обхода нет.
  canStartRound = true,
  badge = /** @type {string|null} */ (null),
  mergeLabel = /** @type {((number: number) => string)|null} */ (null),
  // Строки статистики карточки завершения; по умолчанию — итоги утечек.
  stats = /** @type {Array<{key: string, label: string, value: number, tone: "open"|"repair"|"resolved"}>|null} */ (
    null
  ),
}) {
  const { t } = useLanguage();

  const isCompleted = Boolean(round?.completedAt);
  const toneClass = {
    open: s.statOpen,
    repair: s.statRepair,
    resolved: s.statResolved,
  };
  const statRows = stats ?? [
    { key: "open", label: texts.openResult, value: summary.open, tone: "open" },
    {
      key: "repair",
      label: texts.repairResult,
      value: summary.inProgress,
      tone: "repair",
    },
    {
      key: "resolved",
      label: texts.resolvedResult,
      value: summary.resolved,
      tone: "resolved",
    },
  ];

  return (
    <>
      <header className={s.header}>
        <div>
          {round?.startedAt ? (
            <div className={s.roundMeta}>
              <span className={s.roundBadge}>
                {badge ?? t("monitoring.roundBadge")} № {round.number ?? 1}
              </span>
              <span className={s.roundPeriod}>
                · {formatRoundPeriod(round.startedAt, round.completedAt, lang)}
              </span>
              {/* «Новый обход» нажали по ошибке — вернуть в предыдущий. */}
              {onMergeRound && !isCompleted && Number(round.number) > 1 && (
                <button
                  type="button"
                  className={s.mergeRoundBtn}
                  onClick={onMergeRound}
                >
                  {mergeLabel
                    ? mergeLabel(Number(round.number) - 1)
                    : t("monitoring.mergeAction", {
                        number: Number(round.number) - 1,
                      })}
                </button>
              )}
            </div>
          ) : (
            <p>{texts.noActiveRound}</p>
          )}
        </div>
        {!showCompletion && canStartRound && (
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
          className={`${s.completionCard} ${
            isCompleted ? s.completionCardDone : ""
          }`}
          aria-live="polite"
        >
          <div className={s.completionSummary}>
            <span className={s.completionIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="m7.5 12.5 3 3 6-7" />
              </svg>
            </span>
            <div className={s.completionHeading}>
              <strong>
                {isCompleted ? texts.roundCompleted : texts.roundReady}
              </strong>
              <span>
                {summary.checked}/{summary.total}
              </span>
            </div>
          </div>
          <div className={s.completionStats}>
            {statRows.map((row) => (
              <span key={row.key} className={s.completionStat}>
                <i className={toneClass[row.tone]} />
                <small>{row.label}</small>
                <strong>{row.value}</strong>
              </span>
            ))}
          </div>
          {(isCompleted ? canStartRound : canFinishRound) && (
            <button
              type="button"
              className={s.completionAction}
              onClick={isCompleted ? onStartRound : onFinishRound}
            >
              {isCompleted ? texts.newRound : texts.finishRound}
            </button>
          )}
        </section>
      )}
    </>
  );
}
