import s from "./AddLeakFooter.module.scss";

export default function AddLeakFooter({
  prevStep,
  nextStep,
  save,
  step,
  stepsLength,
  isSaving, 
}) {
  return (
    <div className={s.footer}>
      <button
        className={s.prevBtn}
        onClick={prevStep}
        disabled={step === 1 || isSaving}
      >
        ← Назад
      </button>

      {step < stepsLength ? (
        <button
          className={s.nextBtn}
          onClick={nextStep}
          disabled={isSaving}
        >
          Далее →
        </button>
      ) : (
        <button
          className={s.saveBtn}
          onClick={save}
          disabled={isSaving}
        >
          {isSaving ? "Сохранение..." : "💾 Сохранить"}
        </button>
      )}
    </div>
  );
}