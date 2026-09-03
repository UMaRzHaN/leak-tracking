import { fieldLabel } from "@/utils/fieldLabels";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * Точность отдельной строкой, а не колонкой координат.
 *
 * Соседи форматируются с шестью знаками после запятой — это верно для широты и
 * долготы и бессмысленно для радиуса в метрах: «12.000000» вместо «±12 м».
 * И читается она иначе: это не третья координата, а мера доверия к первым двум.
 */
function accuracyMetres(data) {
  const value = Number(data?.coords_accuracy);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

export default function LeakLocationSection({ data, fields, localeTexts, t }) {
  const accuracy = accuracyMetres(data);
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

      {hasAny && accuracy != null && (
        <div className={s.fieldRow}>
          <span className={s.fieldLabel}>
            {t("leakDetails.coordsAccuracy")}
          </span>
          <span className={s.fieldValue}>
            {t("leakDetails.coordsAccuracyValue", { count: accuracy })}
          </span>
        </div>
      )}
    </div>
  );
}
