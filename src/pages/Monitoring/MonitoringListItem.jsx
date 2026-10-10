import { memo } from "react";
import { useRenderMetric } from "@/utils/renderMetrics";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import {
  formatMonitoringDate,
  getLastMonitoringRecord,
  getMonitoringResultLabel,
  isMonitoringDue,
} from "@/utils/monitoring";
import Icon from "@/components/ui/Icon/Icon";
import s from "./Monitoring.module.scss";

function MonitoringListItem({
  leak,
  lang,
  texts,
  roundId,
  roundNumber,
  hasActiveRound,
  onOpenDetails,
  onMonitor,
}) {
  useRenderMetric("MonitoringListItem");

  const last = getLastMonitoringRecord(leak);
  const isDue = hasActiveRound && isMonitoringDue(leak, roundId, roundNumber);
  // Проверенная в текущем обходе — зелёная строка с галочкой (5b); повторную
  // проверку не прячем, но кнопка становится второстепенной.
  const checkedInRound = hasActiveRound && !isDue && Boolean(last);
  const displayedUser = last ? last.monitoredBy : leak.detectedBy;

  return (
    <article className={s.monitoringItem}>
      <LeakCardCompact
        leak={leak}
        className={s.monitoringCard}
        onOpenDetails={onOpenDetails}
        onMonitor={onMonitor}
        nearbyDist={leak._nearbyDist}
      />

      <div className={s.monitoringBar}>
        <div className={s.monitoringBarText}>
          <span
            className={
              checkedInRound
                ? s.okText
                : last && isDue
                  ? s.dueText
                  : s.neverText
            }
          >
            {checkedInRound && (
              <Icon name="check" size={13} strokeWidth={2.6} />
            )}
            {last
              ? `${texts.lastCheck}: ${formatMonitoringDate(last.date, lang)}`
              : texts.never}
          </span>
          <span className={s.monitoringBarMeta}>
            {last && (
              <strong>{getMonitoringResultLabel(last.result, lang)}</strong>
            )}
            {last && displayedUser && <span aria-hidden="true">·</span>}
            {displayedUser && <em>{displayedUser}</em>}
          </span>
        </div>

        <button
          type="button"
          className={`${s.checkBtn} ${checkedInRound ? s.checkBtnSecondary : ""}`}
          onClick={() => onMonitor(leak)}
        >
          {texts.check}
        </button>
      </div>
    </article>
  );
}

export default memo(MonitoringListItem);
