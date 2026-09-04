import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import { getMonitoringResultLabel } from "@/utils/monitoring";
import { LEAK_EVENT_TYPES } from "@/domain/leakEvents";
import { displayText, fmtDate } from "./viewBlockUtils";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * Строки ленты: один обход и одна починка.
 *
 * Отделены от самого раздела истории: там решают, что показать и в каком
 * порядке, а здесь — как выглядит одна запись со своими снимками и подписями.
 */
export function MonitoringRecordRow({ record, localeTexts, lang }) {
  const { t } = useLanguage();

  const photoSrc = usePhotoSrc(record.photo ?? null);
  const previousPhotoSrc = usePhotoSrc(record.previousPhoto ?? null);
  const [viewerSrc, setViewerSrc] = useState(/** @type {string|null} */ (null));
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

/**
 * Ремонт в той же ленте, что и обходы.
 *
 * Отдельной вкладкой это было бы седьмой на телефоне, а вопрос у человека
 * один: что с утечкой происходило. Осмотр и ремонт идут вперемешку по времени
 * — так их и читают. И только здесь виден снимок первой починки: на самой
 * записи `photo_repair` к этому моменту уже перезаписан второй.
 */
export function RepairEventRow({ event, localeTexts, lang }) {
  const photoSrc = usePhotoSrc(event.photo ?? null);
  const [viewerSrc, setViewerSrc] = useState(/** @type {string|null} */ (null));
  const label = localeTexts.repairEvents[event.type] ?? event.type;

  return (
    <>
      <article className={s.monitoringRecord} data-event={event.type}>
        <header className={s.monitoringRecordHeader}>
          <time className={s.monitoringRecordDate} dateTime={event.date}>
            {fmtDate(event.date, lang)}
          </time>
          <span className={s.monitoringRoundBadge}>{label}</span>
        </header>

        <div className={s.monitoringRecordContent}>
          <div className={s.monitoringRecordText}>
            {event.user && (
              <div className={s.monitoringMetaRow}>
                <span>{localeTexts.user}</span>
                <strong>{displayText(event.user)}</strong>
              </div>
            )}
          </div>

          {photoSrc && (
            <div className={s.monitoringPhotos}>
              <div className={s.monitoringPhotoBlock}>
                <span className={s.monitoringPhotoTitle}>
                  {localeTexts.repairEvents.photo}
                </span>
                <button
                  type="button"
                  className={s.monitoringPhotoBtn}
                  onClick={() => setViewerSrc(photoSrc)}
                  aria-label={localeTexts.repairEvents.photo}
                >
                  <img
                    src={photoSrc}
                    alt={localeTexts.repairEvents.photo}
                    className={s.monitoringPhotoImg}
                    loading="lazy"
                    draggable={false}
                  />
                </button>
              </div>
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

export const REPAIR_EVENT_TYPES = new Set([
  LEAK_EVENT_TYPES.REPAIR_STARTED,
  LEAK_EVENT_TYPES.REPAIR_DONE,
]);
