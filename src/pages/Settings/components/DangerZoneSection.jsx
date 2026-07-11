import s from "../Settings.module.scss";

export default function DangerZoneSection({
  activeProject,
  localeTexts,
  onClearDatabase,
}) {
  if (!activeProject) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.dangerZone}</h2>
      </div>
      <div className={s.dangerBody}>
        <p className={s.dangerHint}>{localeTexts.dangerHint}</p>
        <button className={s.dangerBtn} type="button" onClick={onClearDatabase}>
          {localeTexts.clearDatabase}
        </button>
      </div>
    </section>
  );
}
