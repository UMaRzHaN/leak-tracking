import s from "../Settings.module.scss";

export default function CalculationParametersSection({
  activeProject,
  localeTexts,
  onEdit,
}) {
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.calculationParameters}</h2>
      </div>
      <div className={s.calcBody}>
        <p className={s.description}>
          {localeTexts.projectSettings} <strong>{activeProject.name}</strong>
        </p>
        <button className={s.editVarsBtn} type="button" onClick={onEdit}>
          {localeTexts.editParameters}
        </button>
      </div>
    </section>
  );
}
