import s from "@/features/leakForm/LeakForm.module.scss";

export default function ClearActions({
  hasStepData,
  onClearStep,
  onClearAll,
  localeTexts,
}) {
  const buttons = localeTexts?.buttons ?? {};

  return (
    <div className={s.clearActions}>
      {hasStepData && (
        <button type="button" className={s.clearStepIcon} onClick={onClearStep}>
          {buttons.clearStep ?? "Clear step 🧽"}
        </button>
      )}
      <button className={s.clearAllSteps} type="button" onClick={onClearAll}>
        {buttons.clearAll ?? "Clear all fields 🧹"}
      </button>
    </div>
  );
}
