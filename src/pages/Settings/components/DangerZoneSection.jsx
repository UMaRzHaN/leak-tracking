import s from "../Settings.module.scss";

export default function DangerZoneSection({
  activeProject,
  localeTexts,
  onClearDatabase,
  onRemoveProject = /** @type {(() => void)|null} */ (null),
}) {
  if (!activeProject) return null;

  return (
    <section className={`${s.section} ${s.dangerSection}`}>
      <div className={s.sectionHead}>
        <h2 className={s.dangerSectionTitle}>
          <span className={s.dangerIcon} aria-hidden="true">
            !
          </span>
          {localeTexts.dangerZone}
        </h2>
      </div>
      <div className={s.dangerBody}>
        <p className={s.dangerHint}>{localeTexts.dangerHint}</p>
        <button className={s.dangerBtn} type="button" onClick={onClearDatabase}>
          {localeTexts.clearDatabase}
        </button>
        {onRemoveProject && (
          <button
            className={s.dangerBtn}
            type="button"
            onClick={onRemoveProject}
          >
            {localeTexts.deleteProject}
          </button>
        )}
      </div>
    </section>
  );
}
