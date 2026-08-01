import { getPriorityMeta } from "@/utils/priority";
import { formatLeakDate } from "@/utils/locale";
import { translateFieldLabel } from "./viewBlockUtils";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

export default function LeakSummarySection({
  data,
  fields,
  localeTexts,
  t,
  lang,
}) {
  const hasAny = fields.some(
    (field) => data[field.key] != null && data[field.key] !== "",
  );
  const priority = data.priority
    ? getPriorityMeta(data.priority, t, lang)
    : null;

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
        fields.map(({ key, label, multiline }) => {
          const value = data[key];
          if (value == null || value === "") return null;
          return (
            <div
              key={key}
              className={`${s.fieldRow} ${multiline ? s.fieldRowMulti : ""}`}
            >
              <span className={s.fieldLabel}>
                {translateFieldLabel(key, label, t, lang)}
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
        })
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📋</span>
          <p>{localeTexts.empty.info}</p>
        </div>
      )}
    </div>
  );
}
