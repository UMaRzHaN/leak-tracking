import { memo } from "react";
import { useRenderMetric } from "@/utils/renderMetrics";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import {
  formatMonitoringDate,
  getLastMonitoringRecord,
  getMonitoringResultLabel,
  isMonitoringDue,
} from "@/utils/monitoring";
import s from "./Monitoring.module.scss";

function MonitoringListItem({
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
  useRenderMetric("MonitoringListItem");

  const last = getLastMonitoringRecord(leak);
  const isDue = hasActiveRound && isMonitoringDue(leak, roundId, roundNumber);
  const displayedUser = last ? last.monitoredBy : leak.detectedBy;

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
          {displayedUser && <em>{displayedUser}</em>}
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

export default memo(MonitoringListItem);
