import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import {
  formatMonitoringDate,
  getLastMonitoringRecord,
  getMonitoringResultLabel,
  isMonitoringDue,
} from "@/utils/monitoring";
import s from "./Monitoring.module.scss";

export default function MonitoringListItem({
  leak,
  lang,
  texts,
  roundId,
  roundNumber,
  hasActiveRound,
  onOpenDetails,
  onPickStatus,
  onMonitor,
}) {
  const last = getLastMonitoringRecord(leak);
  const isDue = hasActiveRound && isMonitoringDue(leak, roundId, roundNumber);

  return (
    <article className={s.monitoringItem}>
      <LeakCardCompact
        leak={leak}
        className={s.monitoringCard}
        onOpenDetails={onOpenDetails}
        onPickStatus={onPickStatus}
        onMonitor={onMonitor}
        nearbyDist={leak._nearbyDist}
      />

      <div className={s.monitoringBar}>
        <div className={s.monitoringBarText}>
          <span className={isDue ? s.dueText : s.okText}>
            {last
              ? `${texts.lastCheck}: ${formatMonitoringDate(last.date, lang)}`
              : texts.never}
          </span>
          {last && (
            <strong>{getMonitoringResultLabel(last.result, lang)}</strong>
          )}
          {leak.detectedBy && <em>{leak.detectedBy}</em>}
        </div>

        <button
          type="button"
          className={s.checkBtn}
          onClick={() => onMonitor(leak)}
        >
          {texts.check}
        </button>
      </div>
    </article>
  );
}
