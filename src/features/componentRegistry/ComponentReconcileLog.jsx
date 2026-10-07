import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
import { displayText } from "@/features/leakDetails/components/viewBlockUtils";
import { getIntlLocale } from "@/utils/locale";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

// За день компонент могут осмотреть не раз — со временем виден порядок.
function fmtDateTime(iso, lang) {
  return new Date(iso).toLocaleString(getIntlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReconcileLogRow({ entry, lang }) {
  const { t } = useLanguage();
  const photoSrc = usePhotoSrc(entry.photo ?? null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const title = Number.isFinite(entry.roundNumber)
    ? t("components.reconcileLog.round", { number: entry.roundNumber })
    : t("components.reconcileLog.inspection");
  const rows = [
    [t("components.reconcileLog.state"), entry.to],
    [t("components.reconcileLog.comment"), entry.comment],
    [t("components.reconcileLog.user"), entry.user],
  ].filter(([, value]) => value);

  return (
    <>
      <article className={s.monitoringRecord}>
        <header className={s.monitoringRecordHeader}>
          <time className={s.monitoringRecordDate} dateTime={entry.date}>
            {fmtDateTime(entry.date, lang)}
          </time>
          <span className={s.monitoringRoundBadge}>{title}</span>
        </header>

        <div className={s.monitoringRecordContent}>
          <div className={s.monitoringRecordText}>
            {rows.map(([label, value]) => (
              <div key={label} className={s.monitoringMetaRow}>
                <span>{label}</span>
                <strong>{displayText(value)}</strong>
              </div>
            ))}
          </div>

          {photoSrc && (
            <div className={s.monitoringPhotos}>
              <div className={s.monitoringPhotoBlock}>
                <span className={s.monitoringPhotoTitle}>
                  {t("components.reconcileLog.photo")}
                </span>
                <button
                  type="button"
                  className={s.monitoringPhotoBtn}
                  onClick={() => setViewerOpen(true)}
                  aria-label={t("components.reconcileLog.photo")}
                >
                  <img
                    src={photoSrc}
                    alt={t("components.reconcileLog.photo")}
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

      {viewerOpen && photoSrc && (
        <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />
      )}
    </>
  );
}

/**
 * Лог сверок карточки (6b): каждый осмотр — с номером сверки, состоянием,
 * замечанием, подписью и снимком, как лог ремонтов у утечки. Новые сверху.
 */
export default function ComponentReconcileLog({ component }) {
  const { t, lang } = useLanguage();
  const entries = (Array.isArray(component?.history) ? component.history : [])
    .filter(
      (entry) =>
        entry?.action === COMPONENT_HISTORY_ACTIONS.INSPECTED && entry.date,
    )
    .reverse();

  return (
    <div className={s.tabPane}>
      {entries.length > 0 ? (
        entries.map((entry, index) => (
          <ReconcileLogRow
            key={`${entry.date}-${index}`}
            entry={entry}
            lang={lang}
          />
        ))
      ) : (
        <div className={s.tabEmpty}>
          <p>{t("components.reconcileLog.empty")}</p>
        </div>
      )}
    </div>
  );
}
