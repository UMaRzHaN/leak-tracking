import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";
import { SLICE, sliceField, sliceValues } from "@/domain/surveyGroups";
import s from "./Coverage.module.scss";

/**
 * Настройка разреза (4c): поле, по которому считаются частота утечек и
 * охват. Второй уровень разбивки пока не делается — переключатель в макете
 * выключен по умолчанию, и данных под него нет.
 */
export default function SliceScreen({
  value,
  leaks,
  levelKeys,
  onBack,
  onApply,
}) {
  const { t } = useLanguage();
  const [picked, setPicked] = useState(value);
  return (
    <div
      className={s.screen}
      role="dialog"
      aria-modal="true"
      aria-label={t("coverage.sliceTitle")}
    >
      <header className={s.screenHeader}>
        <button
          type="button"
          className={s.back}
          onClick={onBack}
          aria-label={t("leakDetails.back")}
        >
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
        </button>
        <h1>{t("coverage.sliceTitle")}</h1>
      </header>
      <div className={s.screenBody}>
        <p className={s.hint}>{t("coverage.sliceLead")}</p>
        <h2 className={s.caption}>{t("coverage.primaryField")}</h2>
        <div role="radiogroup" className={s.sliceList}>
          {Object.values(SLICE).map((slice) => {
            const examples = sliceValues(
              leaks,
              sliceField(slice, levelKeys),
            ).slice(0, 3);
            return (
              <button
                key={slice}
                type="button"
                role="radio"
                aria-checked={picked === slice}
                className={picked === slice ? s.sliceOn : s.sliceOff}
                onClick={() => setPicked(slice)}
              >
                <span>
                  <strong>{t(`coverage.slices.${slice}.title`)}</strong>
                  <small>
                    {examples.length
                      ? examples.join(", ")
                      : t(`coverage.slices.${slice}.hint`)}
                  </small>
                </span>
                <span className={s.radioDot} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <footer className={s.footer}>
        <button
          type="button"
          className={s.primary}
          onClick={() => onApply(picked)}
        >
          {t("coverage.apply")}
        </button>
      </footer>
    </div>
  );
}
