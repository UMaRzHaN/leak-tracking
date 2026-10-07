import { useLanguage } from "@/app/hooks/useLanguage";
import { getComponentReconcileLog } from "@/domain/componentPhotos";
import RecordPhotos from "@/features/leakDetails/components/RecordPhotos";
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
  const title = Number.isFinite(entry.roundNumber)
    ? t("components.reconcileLog.round", { number: entry.roundNumber })
    : t("components.reconcileLog.inspection");
  const rows = [
    [t("components.reconcileLog.state"), entry.to],
    [t("components.reconcileLog.comment"), entry.comment],
    [t("components.reconcileLog.user"), entry.user],
  ].filter(([, value]) => value);

  return (
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

        <RecordPhotos
          before={entry.previousPhoto}
          beforeLabel={t("components.reconcileLog.photoBefore")}
          after={entry.photo}
          afterLabel={t("components.reconcileLog.photo")}
        />
      </div>
    </article>
  );
}

/**
 * Лог сверок карточки (6b): каждый осмотр — с номером сверки, состоянием,
 * замечанием, подписью и снимками «до» и «после», как лог ремонтов у утечки.
 * Новые сверху.
 */
export default function ComponentReconcileLog({ component }) {
  const { t, lang } = useLanguage();
  const entries = getComponentReconcileLog(component);

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
