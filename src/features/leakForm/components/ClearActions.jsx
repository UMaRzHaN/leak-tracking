import s from "@/features/leakForm/LeakForm.module.scss";

export default function ClearActions({ hasStepData, onClearStep, onClearAll }) {
  return (
    <div className={s.clearActions}>
      {hasStepData && (
        <button type="button" className={s.clearStepIcon} onClick={onClearStep}>
          Очистить шаг 🧽
        </button>
      )}
      <button className={s.clearAllSteps} type="button" onClick={onClearAll}>
        Очистить все поля 🧹
      </button>
    </div>
  );
}
