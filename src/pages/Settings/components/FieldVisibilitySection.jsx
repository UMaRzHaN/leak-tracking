import s from "../Settings.module.scss";

export default function FieldVisibilitySection({
  activeProject,
  hiddenFields,
  lang,
  localeTexts,
  onConfigure,
}) {
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.fieldsAndExcel}</h2>
      </div>
      <div className={s.calcBody}>
        <p className={s.description}>
          {localeTexts.fieldsDescription}
          {hiddenFields.size > 0 && (
            <strong>
              {" "}
              {lang === "ru"
                ? `Скрыто: ${hiddenFields.size}.`
                : `Hidden: ${hiddenFields.size}.`}
            </strong>
          )}
        </p>
        <button className={s.editVarsBtn} type="button" onClick={onConfigure}>
          {localeTexts.configureFields}
        </button>
      </div>
    </section>
  );
}
