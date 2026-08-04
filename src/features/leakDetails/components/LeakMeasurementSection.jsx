import { fieldLabel } from "@/utils/fieldLabels";
import { IDENTIFIER_KEYS } from "./viewBlockUtils";
import { getIntlLocale } from "@/utils/locale";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

export default function LeakMeasurementSection({
  data,
  fields,
  localeTexts,
  t,
  lang,
}) {
  const hasAny = fields.some(
    (field) => data[field.key] != null && data[field.key] !== "",
  );

  return (
    <div className={s.tabPane}>
      {hasAny ? (
        <div className={s.paramsGrid}>
          {fields.map(({ key, label }) => {
            const raw = data[key];
            if (raw == null || raw === "") return null;
            const number = Number(raw);
            const display =
              IDENTIFIER_KEYS.has(key) || Number.isNaN(number)
                ? String(raw)
                : number.toLocaleString(getIntlLocale(lang));
            return (
              <div key={key} className={s.paramCard}>
                <span className={s.paramLabel}>
                  {fieldLabel(key, t, label)}
                </span>
                <span className={s.paramValue}>{display}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📊</span>
          <p>{localeTexts.empty.params}</p>
        </div>
      )}
    </div>
  );
}
