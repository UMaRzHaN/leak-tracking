import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import { getRepairLog } from "@/domain/repairStages";
import { getRepairStageMeta } from "@/utils/repairStage";
import { displayText } from "./viewBlockUtils";
import { getIntlLocale } from "@/utils/locale";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

// За день по утечке бывает несколько отметок — со временем видно порядок.
function fmtDateTime(iso, lang) {
  return new Date(iso).toLocaleString(getIntlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Заголовок строки: для отметки — стадия, для остального — что случилось.
const KIND_TEXT = {
  repair_started: "leakDetails.repairLog.started",
  repair_done: "leakDetails.repairLog.done",
  returned: "leakDetails.repairLog.returned",
};

function RepairLogRow({ item, lang }) {
  const { t } = useLanguage();
  const photoSrc = usePhotoSrc(item.photo ?? null);
  const [viewerSrc, setViewerSrc] = useState(/** @type {string|null} */ (null));
  const title = item.stage
    ? getRepairStageMeta(item.stage, t).label
    : t(KIND_TEXT[item.kind] ?? "leakDetails.repairLog.started");
  const rows = [
    [t("leakDetails.repairLog.brigade"), item.brigade],
    [t("leakDetails.repairLog.materials"), item.materials],
    [t("leakDetails.repairLog.note"), item.note],
    [t("leakDetails.user"), item.user],
  ].filter(([, value]) => value);

  return (
    <>
      <article className={s.monitoringRecord} data-event={item.kind}>
        <header className={s.monitoringRecordHeader}>
          <time className={s.monitoringRecordDate} dateTime={item.date}>
            {fmtDateTime(item.date, lang)}
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
                  {t("leakDetails.repairEvents.photo")}
                </span>
                <button
                  type="button"
                  className={s.monitoringPhotoBtn}
                  onClick={() => setViewerSrc(photoSrc)}
                  aria-label={t("leakDetails.repairEvents.photo")}
                >
                  <img
                    src={photoSrc}
                    alt={t("leakDetails.repairEvents.photo")}
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

/**
 * Лог ремонтов карточки: начала и завершения ремонтов, отметки стадий из
 * обхода и проверки ремонта, возвраты в «Ожидает МТР». Новые сверху.
 */
export default function LeakRepairLog({ data }) {
  const { t, lang } = useLanguage();
  const items = getRepairLog(data);

  return (
    <div className={s.tabPane}>
      {items.length > 0 ? (
        items.map((item) => (
          <RepairLogRow key={item.id} item={item} lang={lang} />
        ))
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>R</span>
          <p>{t("leakDetails.repairLog.empty")}</p>
        </div>
      )}
    </div>
  );
}
