import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "../Settings.module.scss";

/**
 * Раздел «скрыть поля» — один на две сущности.
 *
 * Заголовок и описание приходят снаружи: у утечки и у карточки компонента
 * списки полей раздельные, а вид у раздела один. Выбор режима журнала
 * мониторинга рисуется только там, где его передали, — к реестру он отношения
 * не имеет.
 */
export default function FieldVisibilitySection({
  activeProject,
  hiddenFields,
  localeTexts,
  title = /** @type {string|null} */ (null),
  description = /** @type {string|null} */ (null),
  exportMode = /** @type {string|null} */ (null),
  onConfigure,
  onExportModeChange = /** @type {((mode: string) => void)|null} */ (null),
}) {
  const { t } = useLanguage();

  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>
          {title ?? localeTexts.fieldsAndExcel}
        </h2>
      </div>
      <div className={s.calcBody}>
        <p className={s.description}>
          {description ?? localeTexts.fieldsDescription}
          {hiddenFields.size > 0 && (
            <strong>
              {" "}
              {t("settings.hiddenFieldsCount", { count: hiddenFields.size })}
            </strong>
          )}
        </p>
        <button className={s.editVarsBtn} type="button" onClick={onConfigure}>
          {localeTexts.configureFields}
        </button>

        {onExportModeChange && (
          <div className={s.exportModeInline}>
            <span className={s.exportModeLabel}>
              {localeTexts.excelExportMode}
            </span>
            <div
              className={s.exportModeOptions}
              role="radiogroup"
              aria-label={localeTexts.excelExportMode}
            >
              {[
                {
                  value: EXCEL_MONITORING_EXPORT_MODE.FULL,
                  label: localeTexts.excelExportFull,
                  hint: localeTexts.excelExportFullHint,
                },
                {
                  value: EXCEL_MONITORING_EXPORT_MODE.LATEST_PER_ROUND,
                  label: localeTexts.excelExportLatest,
                  hint: localeTexts.excelExportLatestHint,
                },
              ].map((option) => {
                const selected = exportMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`${s.exportModeOption} ${
                      selected ? s.exportModeOptionActive : ""
                    }`}
                    onClick={() => onExportModeChange(option.value)}
                  >
                    <span className={s.exportModeRadio} aria-hidden="true" />
                    <span className={s.exportModeText}>
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
