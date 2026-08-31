import { useLanguage } from "@/app/hooks/useLanguage";
import s from "../Settings.module.scss";
import c from "./FieldsColumns.module.scss";

/**
 * Одна колонка блока «поля и Excel»: чьи поля, сколько скрыто, кнопка.
 *
 * Утечка и карточка компонента различаются только этим — списки у них
 * раздельные, а разговор с человеком один и тот же.
 */
export default function FieldsColumn({
  title,
  description,
  hiddenFields,
  onConfigure,
}) {
  const { t } = useLanguage();

  return (
    <div>
      <h3 className={c.fieldsColumnTitle}>{title}</h3>
      <p className={s.description}>
        {description}
        {hiddenFields.size > 0 && (
          <strong>
            {" "}
            {t("settings.hiddenFieldsCount", { count: hiddenFields.size })}
          </strong>
        )}
      </p>
      <button className={s.editVarsBtn} type="button" onClick={onConfigure}>
        {t("settings.configureFields")}
      </button>
    </div>
  );
}
