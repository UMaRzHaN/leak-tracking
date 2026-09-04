import { Component } from "react";
import {
  getMonitoringHistoryComment,
  getMonitoringRecords,
} from "@/utils/monitoring";
import { getLeakEvents } from "@/domain/leakEvents";
import {
  ACTION_ICONS,
  displayText,
  STATUS_COLORS,
  fmtDate,
  formatHistoryValue,
  getHistoryChangeLabel,
  relativeTime,
} from "./viewBlockUtils";
import {
  MonitoringRecordRow,
  REPAIR_EVENT_TYPES,
  RepairEventRow,
} from "./LeakHistoryRows";
import { logger } from "@/utils/logger";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

class HistoryErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logger.error("[LeakHistorySection]", error, info);
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className={s.tabEmpty} role="alert">
        <span className={s.tabEmptyIcon}>!</span>
        <p>{this.props.t("leakDetails.historyDamaged")}</p>
      </div>
    );
  }
}

function MonitoringHistory({ data, localeTexts, lang }) {
  const repairs = getLeakEvents(data).filter(
    (event) => REPAIR_EVENT_TYPES.has(event?.type) && event?.date,
  );
  const records = [...getMonitoringRecords(data), ...repairs].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date),
  );

  return (
    <div className={s.tabPane}>
      {records.length > 0 ? (
        records.map((record) =>
          REPAIR_EVENT_TYPES.has(record.type) ? (
            <RepairEventRow
              key={record.id ?? record.date}
              event={record}
              localeTexts={localeTexts}
              lang={lang}
            />
          ) : (
            <MonitoringRecordRow
              key={record.id ?? record.date}
              record={record}
              localeTexts={localeTexts}
              lang={lang}
            />
          ),
        )
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>M</span>
          <p>{localeTexts.empty.monitoring}</p>
        </div>
      )}
    </div>
  );
}

function ChangeHistory({ data, fields, localeTexts, t, lang }) {
  const history = Array.isArray(data.history)
    ? [...data.history].reverse()
    : [];

  return (
    <div className={s.tabPane}>
      {history.length > 0 ? (
        history.map((entry, index) => {
          const relative = relativeTime(entry.date, t);
          const absolute = fmtDate(entry.date, lang);
          const action = displayText(entry.action);
          const targetStatus = displayText(entry.to);
          const statusColor = targetStatus ? STATUS_COLORS[targetStatus] : null;
          const icon = ACTION_ICONS[action] ?? "•";
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          const user = displayText(
            entry.user ?? entry.monitoredBy ?? entry.detectedBy,
          );
          const comment = getMonitoringHistoryComment(entry);
          return (
            <div key={index} className={s.logEntry}>
              <div className={s.logDotWrap}>
                <span
                  className={s.logDot}
                  style={
                    statusColor
                      ? { background: statusColor, borderColor: statusColor }
                      : undefined
                  }
                >
                  {icon}
                </span>
                {index < history.length - 1 && <span className={s.logLine} />}
              </div>
              <div className={s.logBody}>
                <span className={s.logAction}>
                  {localeTexts.actions[action] ?? action}
                </span>
                {user && (
                  <span className={s.logUser}>
                    {localeTexts.user}: {user}
                  </span>
                )}
                {targetStatus && (
                  <span
                    className={s.logStatus}
                    style={statusColor ? { color: statusColor } : undefined}
                  >
                    {localeTexts.statuses[targetStatus] ?? targetStatus}
                  </span>
                )}
                {comment && <span className={s.logCommentText}>{comment}</span>}
                {changes.length > 0 && (
                  <div className={s.logChanges}>
                    {changes.map((change, changeIndex) => (
                      <div
                        key={`${change.key}-${changeIndex}`}
                        className={s.logChange}
                      >
                        <span className={s.logChangeLabel}>
                          {getHistoryChangeLabel(
                            change,
                            fields,
                            localeTexts,
                            t,
                          )}
                        </span>
                        <span
                          className={`${s.logChangeValue} ${s.logChangeValueBefore}`}
                        >
                          {formatHistoryValue(
                            change.key,
                            change.from,
                            change.kind,
                            t,
                            lang,
                          )}
                        </span>
                        <span className={s.logChangeArrow}>→</span>
                        <span
                          className={`${s.logChangeValue} ${s.logChangeValueAfter}`}
                        >
                          {formatHistoryValue(
                            change.key,
                            change.to,
                            change.kind,
                            t,
                            lang,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <span className={s.logDate}>
                  {relative ? (
                    <>
                      {relative} ·{" "}
                      <span className={s.logDateAbs}>{absolute}</span>
                    </>
                  ) : (
                    absolute
                  )}
                </span>
              </div>
            </div>
          );
        })
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>🕐</span>
          <p>{localeTexts.empty.history}</p>
        </div>
      )}
    </div>
  );
}

export default function LeakHistorySection({
  activeTab,
  data,
  fields,
  localeTexts,
  t,
  lang,
}) {
  const resetKey = `${data?.id ?? "unknown"}:${activeTab}`;
  return (
    <HistoryErrorBoundary resetKey={resetKey} lang={lang}>
      {activeTab === "monitoring" ? (
        <MonitoringHistory data={data} localeTexts={localeTexts} lang={lang} />
      ) : (
        <ChangeHistory
          data={data}
          fields={fields}
          localeTexts={localeTexts}
          t={t}
          lang={lang}
        />
      )}
    </HistoryErrorBoundary>
  );
}
