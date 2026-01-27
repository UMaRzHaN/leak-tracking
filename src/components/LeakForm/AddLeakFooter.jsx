import s from "./AddLeakFooter.module.scss";

export default function AddLeakFooter({ prevStep, nextStep, save, step, stepsLength }) {
  return (
    <div className={s.footer}>
      <button
        className={s.prevBtn}
        onClick={prevStep}
        disabled={step === 1}
      >
        ← Назад
      </button>

      {step < stepsLength ? (
        <button className={s.nextBtn} onClick={nextStep}>
          Далее →
        </button>
      ) : (
        <button className={s.saveBtn} onClick={save}>
          💾 Сохранить
        </button>
      )}
    </div>
  );
}
