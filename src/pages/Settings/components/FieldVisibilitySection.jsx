import { EXCEL_MONITORING_EXPORT_MODE } from "@/utils/excelExportMode";
import { useLanguage } from "@/app/hooks/useLanguage";
import FieldsColumn from "./FieldsColumn";
import s from "../Settings.module.scss";
import c from "./FieldsColumns.module.scss";

/**
 * «Поля и Excel» — один блок на обе сущности, в две колонки.
 *
 * Раньше это были два одинаковых раздела подряд, и между ними вклинивался
 * выбор режима журнала мониторинга: человек читал «Настроить поля», потом
 * что-то про обходы, потом снова «Настроить поля» — и не понимал, чем вторая
 * кнопка отличается от первой. Рядом разница видна сразу.
 *
 * Списки скрытого при этом остаются раздельными: имена полей у утечки и у
 * карточки компонента пересекаются.
 *
 * Колонка реестра появляется только у проектов с реестром; без неё блок
 * остаётся одноколоночным, как и был.
 */
export default function FieldVisibilitySection({
  activeProject,
  hiddenFields,
  localeTexts,
  exportMode = /** @type {string|null} */ (null),
  onConfigure,
  onExportModeChange = /** @type {((mode: string) => void)|null} */ (null),
  registry = /** @type {any} */ (null),
}) {
  const { t } = useLanguage();

  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.fieldsAndExcel}</h2>
      </div>
      <div className={s.calcBody}>
        <div className={c.fieldsColumns}>
          <FieldsColumn
            title={t("settings.fieldsLeaks")}
            description={localeTexts.fieldsDescription}
            hiddenFields={hiddenFields}
            onConfigure={onConfigure}
          />
          {registry && (
            <FieldsColumn
              title={t("settings.fieldsRegistry")}
              description={t("settings.componentFieldsDescription")}
              hiddenFields={registry.hiddenFields}
              onConfigure={registry.onConfigure}
            />
          )}
        </div>

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
