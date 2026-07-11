import s from "./AddLeakSuccess.module.scss";

export default function AddLeakSuccess({
  localeTexts,
  chips,
  onNewLeak,
  onHome,
}) {
  return (
    <section className={s.successPage}>
      <div className={s.successCard}>
        <div className={s.successIcon} aria-hidden="true" />
        <h2>{localeTexts.title}</h2>
        <p>{localeTexts.description}</p>

        {chips.length > 0 && (
          <div className={s.successChips}>
            {chips.map((chip) => (
              <span className={s.successChip} key={chip.label}>
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </span>
            ))}
          </div>
        )}

        <button className={s.successPrimary} onClick={onNewLeak}>
          {localeTexts.newLeak}
        </button>
        <button className={s.successSecondary} onClick={onHome}>
          {localeTexts.home}
        </button>
      </div>
    </section>
  );
}
