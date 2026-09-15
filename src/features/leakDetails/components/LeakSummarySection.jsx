import { getStatusRepairMilestones } from "@/domain/leakEvents";
import { fieldLabel } from "@/utils/fieldLabels";
import { getPriorityMeta } from "@/utils/priority";
import { formatLeakDate } from "@/utils/locale";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

const MILESTONE_KEYS = new Set(["repairAt", "resolvedAt"]);
const DATE_ONLY = /^(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/;
const DATE_TIME = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Дата со временем: ремонт, начатый и законченный в одни сутки, без часов не
 * отличить от мгновенного. Дата, у которой времени не было — пришла днём из
 * книги или журнала, — показывается днём, а не выдуманной полуночью.
 */
function formatMilestoneDate(value, lang) {
  const dateOnly = typeof value === "string" && DATE_ONLY.test(value.trim());
  return formatLeakDate(value, dateOnly ? {} : DATE_TIME, lang);
}

export default function LeakSummarySection({
  data,
  fields,
  localeTexts,
  t,
  lang,
}) {
  // Даты ремонта и устранения выводятся из ленты по статусу, как в листе
  // «Утечки», а не читаются из полей записи: с переезда ремонта в ленту эти
  // поля не пишутся, и карточка показывала бы пустоту при «В ремонте».
  const milestones = getStatusRepairMilestones(data);
  const milestoneRows = [
    ["repairAt", milestones.repairAt],
    ["resolvedAt", milestones.resolvedAt],
  ].filter(([, value]) => value != null && value !== "");
  const plainFields = fields.filter((field) => !MILESTONE_KEYS.has(field.key));
  const hasAny =
    milestoneRows.length > 0 ||
    plainFields.some(
      (field) => data[field.key] != null && data[field.key] !== "",
    );
  const priority = data.priority ? getPriorityMeta(data.priority, t) : null;

  return (
    <div className={s.tabPane}>
      {priority && (
        <div className={s.priorityRow}>
          <span className={s.priorityRowLabel}>{localeTexts.priority}</span>
          <span
            className={s.priorityBtn}
            style={{
              background: priority.bg,
              color: priority.color,
              borderColor: priority.border,
            }}
          >
            {priority.short}
          </span>
        </div>
      )}

      {hasAny ? (
        <>
          {plainFields.map(({ key, label, multiline }) => {
            const value = data[key];
            if (value == null || value === "") return null;
            return (
              <div
                key={key}
                className={`${s.fieldRow} ${multiline ? s.fieldRowMulti : ""}`}
              >
                <span className={s.fieldLabel}>
                  {fieldLabel(key, t, label)}
                </span>
                <span
                  className={`${s.fieldValue} ${multiline ? s.fieldValueMulti : ""}`}
                >
                  {key === "date"
                    ? formatLeakDate(value, {}, lang)
                    : String(value)}
                </span>
              </div>
            );
          })}
          {milestoneRows.map(([key, value]) => (
            <div key={key} className={s.fieldRow}>
              <span className={s.fieldLabel}>{fieldLabel(key, t)}</span>
              <span className={s.fieldValue}>
                {formatMilestoneDate(value, lang)}
              </span>
            </div>
          ))}
        </>
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📋</span>
          <p>{localeTexts.empty.info}</p>
        </div>
      )}
    </div>
  );
}
