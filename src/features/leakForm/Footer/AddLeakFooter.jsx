import s from "./AddLeakFooter.module.scss";

export default function AddLeakFooter({
  prevStep,
  nextStep,
  save,
  step,
  stepsLength,
  isSaving,
  localeTexts,
}) {
  const buttons = localeTexts?.buttons ?? {};
  return (
    <div className={s.footer}>
      <button
        className={s.prevBtn}
        onClick={prevStep}
        disabled={step === 1 || isSaving}
      >
        {buttons.prev ?? "← Back"}
      </button>

      {step < stepsLength ? (
        <button className={s.nextBtn} onClick={nextStep} disabled={isSaving}>
          {buttons.next ?? "Next →"}
        </button>
      ) : (
        <button className={s.saveBtn} onClick={save} disabled={isSaving}>
          {isSaving
            ? (buttons.saving ?? "Saving...")
            : (buttons.save ?? "💾 Save")}
        </button>
      )}
    </div>
  );
}
