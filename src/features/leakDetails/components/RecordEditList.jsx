import { useLanguage } from "@/app/hooks/useLanguage";
import EditTextField from "@/features/editTextField/EditTextField";
import {
  MONITORING_RESULT_ORDER,
  getMonitoringResultLabel,
} from "@/utils/monitoring";
import { getRepairStageMeta } from "@/utils/repairStage";
import {
  RECORD_KIND,
  editableInspections,
  editableRepairs,
  recordKey,
} from "@/domain/recordEdits";
import { fmtDate } from "./viewBlockUtils";
import sheet from "@/features/leakDetails/LeakDetailsSheet.module.scss";
import s from "./RecordEditList.module.scss";

/** Выбор из нескольких ответов кнопками — как на экране осмотра. */
function Choice({ label, value, options, onChange }) {
  return (
    <div className={s.choice}>
      <span className={s.choiceLabel}>{label}</span>
      <div className={s.choiceOptions} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? s.optionOn : s.option}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Правка записанных осмотров (вкладка «Мониторинг») или проверок ремонта
 * («Ремонты») в режиме редактирования карточки. Черновик — по ключу записи;
 * сохраняет его общая кнопка карточки, вместе с остальными правками.
 */
export default function RecordEditList({ leak, kind, edits, setEdits }) {
  const { t, lang } = useLanguage();
  const inspections = kind === RECORD_KIND.INSPECTION;
  const records = inspections
    ? editableInspections(leak)
    : editableRepairs(leak);
  const yesNo = (yes, no) => [
    { value: true, label: yes },
    { value: false, label: no },
  ];

  if (records.length === 0) {
    return (
      <div className={sheet.tabPane}>
        <div className={sheet.tabEmpty}>
          <p>
            {inspections
              ? t("leakDetails.noMonitoringChecks")
              : t("leakDetails.repairLog.empty")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={sheet.tabPane}>
      {records.map((record) => {
        const key = recordKey(record);
        const draft = edits[key] ?? {};
        const value = (field) =>
          field in draft ? draft[field] : record[field];
        const set = (field, next) =>
          setEdits((previous) => ({
            ...previous,
            [key]: { ...previous[key], [field]: next },
          }));
        const title = inspections
          ? Number.isFinite(Number(record.roundNumber))
            ? `${t("leakDetails.round")} №${record.roundNumber}`
            : t("leakDetails.recordEdit.inspection")
          : record.stage
            ? getRepairStageMeta(record.stage, t).label
            : t(`leakDetails.repairEvents.${record.type}`);

        return (
          <section key={key} className={s.record}>
            <header className={s.head}>
              <time dateTime={record.date}>{fmtDate(record.date, lang)}</time>
              <span className={s.badge}>{title}</span>
            </header>

            {inspections && (
              <Choice
                label={t("leakDetails.recordEdit.result")}
                value={value("result")}
                options={MONITORING_RESULT_ORDER.map((result) => ({
                  value: result,
                  label: getMonitoringResultLabel(result, lang),
                }))}
                onChange={(next) => set("result", next)}
              />
            )}
            <Choice
              label={t("monitoring.physicalTag")}
              value={value("physicalTag")}
              options={yesNo(t("monitoring.yes"), t("monitoring.no"))}
              onChange={(next) => set("physicalTag", next)}
            />
            {inspections && (
              <Choice
                label={t("monitoring.fiction")}
                value={value("fiction")}
                options={yesNo(t("monitoring.yes"), t("monitoring.no"))}
                onChange={(next) => set("fiction", next)}
              />
            )}

            <div className={s.fields}>
              {!inspections && (
                <EditTextField
                  label={t("leakDetails.repairLog.brigade")}
                  value={value("brigade") ?? ""}
                  onChange={(next) => set("brigade", next)}
                />
              )}
              <EditTextField
                label={t("leakDetails.materials")}
                multiline
                value={value("materials_equipment") ?? ""}
                onChange={(next) => set("materials_equipment", next)}
              />
              <EditTextField
                label={
                  inspections
                    ? t("leakDetails.roundComment")
                    : t("leakDetails.repairLog.note")
                }
                multiline
                value={value(inspections ? "comment" : "note") ?? ""}
                onChange={(next) => set(inspections ? "comment" : "note", next)}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
