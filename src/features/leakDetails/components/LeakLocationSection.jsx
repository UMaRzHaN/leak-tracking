import { fieldLabel } from "@/utils/fieldLabels";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

export default function LeakLocationSection({ data, fields, localeTexts, t }) {
  const hasAny = fields.some(
    (field) => data[field.key] != null && data[field.key] !== "",
  );

  return (
    <div className={s.tabPane}>
      {hasAny ? (
        fields.map(({ key, label }) => {
          const value = data[key];
          if (value == null || value === "") return null;
          return (
            <div key={key} className={s.fieldRow}>
              <span className={s.fieldLabel}>{fieldLabel(key, t, label)}</span>
              <span className={s.fieldValue}>{Number(value).toFixed(6)}</span>
            </div>
          );
        })
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📍</span>
          <p>{localeTexts.empty.coords}</p>
        </div>
      )}
    </div>
  );
}
