import { useLanguage } from "@/app/hooks/useLanguage";
import FieldsColumn from "./FieldsColumn";
import s from "../Settings.module.scss";
import c from "./FieldsColumns.module.scss";

/**
 * «Поля и Excel» — один блок на обе сущности, в две колонки.
 *
 * Раньше это были два одинаковых раздела подряд, и человек не понимал, чем
 * вторая «Настроить поля» отличается от первой. Рядом разница видна сразу.
 * Как писать журнал мониторинга, выбирают на экране экспорта, а не здесь.
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
  onConfigure,
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
      </div>
    </section>
  );
}
