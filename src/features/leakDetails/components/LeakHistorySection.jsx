import { Component, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import {
  getMonitoringHistoryComment,
  getMonitoringRecords,
  getMonitoringResultLabel,
} from "@/utils/monitoring";
import {
  ACTION_ICONS,
  STATUS_COLORS,
  fmtDate,
  formatHistoryValue,
  getHistoryChangeLabel,
  relativeTime,
} from "./viewBlockUtils";
import { logger } from "@/utils/logger";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function displayText(value) {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value);
  }
  return "";
}

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

function MonitoringRecordRow({ record, localeTexts, lang }) {
  const { t } = useLanguage();

  const photoSrc = usePhotoSrc(record.photo ?? null);
  const previousPhotoSrc = usePhotoSrc(record.previousPhoto ?? null);
  const [viewerSrc, setViewerSrc] = useState(null);
  const roundNumber = Number(record.roundNumber);

  return (
    <>
      <article
        className={s.monitoringRecord}
        data-result={record.result ?? "unknown"}
      >
        <header className={s.monitoringRecordHeader}>
          <time className={s.monitoringRecordDate} dateTime={record.date}>
            {fmtDate(record.date, lang)}
          </time>
          {Number.isFinite(roundNumber) && roundNumber > 0 && (
            <span className={s.monitoringRoundBadge}>
              {localeTexts.monitoring.round} №{roundNumber}
            </span>
          )}
        </header>

        <div className={s.monitoringRecordContent}>
          <div className={s.monitoringRecordText}>
            <div className={s.monitoringSummaryRow}>
              <span className={s.monitoringResultBadge}>
                <span className={s.monitoringResultDot} />
                {getMonitoringResultLabel(record.result, lang)}
              </span>

              {record.monitoredBy && (
                <div className={s.monitoringMetaRow}>
                  <span>{localeTexts.monitoring.inspector}</span>
                  <strong>{displayText(record.monitoredBy)}</strong>
                </div>
              )}
            </div>

            {(record.materialsChanged || record.materials_equipment) && (
              <div className={s.monitoringDetailBlock}>
                <span>{localeTexts.monitoring.materials}</span>
                <p>
                  {displayText(record.materials_equipment) ||
                    t("leakDetails.removed")}
                </p>
              </div>
            )}

            {record.comment && (
              <div className={s.monitoringDetailBlock}>
                <span>{localeTexts.monitoring.comment}</span>
                <p>{displayText(record.comment)}</p>
              </div>
            )}
          </div>

          {(photoSrc || previousPhotoSrc) && (
            <div className={s.monitoringPhotos}>
              {previousPhotoSrc && (
                <div className={s.monitoringPhotoBlock}>
                  <span className={s.monitoringPhotoTitle}>
                    {localeTexts.monitoring.previousPhoto}
                  </span>
                  <button
                    type="button"
                    className={s.monitoringPhotoBtn}
                    onClick={() => setViewerSrc(previousPhotoSrc)}
                    aria-label={localeTexts.monitoring.previousPhoto}
                  >
                    <img
                      src={previousPhotoSrc}
                      alt={localeTexts.monitoring.previousPhoto}
                      className={s.monitoringPhotoImg}
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                </div>
              )}
              {photoSrc && (
                <div className={s.monitoringPhotoBlock}>
                  <span className={s.monitoringPhotoTitle}>
                    {localeTexts.monitoring.photo}
                  </span>
                  <button
                    type="button"
                    className={s.monitoringPhotoBtn}
                    onClick={() => setViewerSrc(photoSrc)}
                    aria-label={localeTexts.photo.monitoring}
                  >
                    <img
                      src={photoSrc}
                      alt={localeTexts.photo.monitoring}
                      className={s.monitoringPhotoImg}
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      {viewerSrc && (
        <PhotoViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />
      )}
    </>
  );
}

function MonitoringHistory({ data, localeTexts, lang }) {
  const records = getMonitoringRecords(data)
    .slice()
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));

  return (
    <div className={s.tabPane}>
      {records.length > 0 ? (
        records.map((record) => (
          <MonitoringRecordRow
            key={record.id ?? record.date}
            record={record}
            localeTexts={localeTexts}
            lang={lang}
          />
        ))
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
                            lang,
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
