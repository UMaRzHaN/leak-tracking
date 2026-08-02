import { useState } from "react";
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
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function MonitoringRecordRow({ record, localeTexts, lang }) {
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
                  <strong>{record.monitoredBy}</strong>
                </div>
              )}
            </div>

            {(record.materialsChanged || record.materials_equipment) && (
              <div className={s.monitoringDetailBlock}>
                <span>{localeTexts.monitoring.materials}</span>
                <p>
                  {record.materials_equipment ||
                    (lang === "ru" ? "Удалено" : "Removed")}
                </p>
              </div>
            )}

            {record.comment && (
              <div className={s.monitoringDetailBlock}>
                <span>{localeTexts.monitoring.comment}</span>
                <p>{record.comment}</p>
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
          const relative = relativeTime(entry.date, lang);
          const absolute = fmtDate(entry.date, lang);
          const statusColor = entry.to ? STATUS_COLORS[entry.to] : null;
          const icon = ACTION_ICONS[entry.action] ?? "•";
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          const user =
            entry.user ?? entry.monitoredBy ?? entry.detectedBy ?? null;
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
                  {localeTexts.actions[entry.action] ?? entry.action}
                </span>
                {user && (
                  <span className={s.logUser}>
                    {localeTexts.user}: {user}
                  </span>
                )}
                {entry.to && (
                  <span
                    className={s.logStatus}
                    style={statusColor ? { color: statusColor } : undefined}
                  >
                    {localeTexts.statuses[entry.to] ?? entry.to}
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
  if (activeTab === "monitoring") {
    return (
      <MonitoringHistory data={data} localeTexts={localeTexts} lang={lang} />
    );
  }
  return (
    <ChangeHistory
      data={data}
      fields={fields}
      localeTexts={localeTexts}
      t={t}
      lang={lang}
    />
  );
}
