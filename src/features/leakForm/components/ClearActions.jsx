import s from "@/features/leakForm/LeakForm.module.scss";

export default function ClearActions({
  hasStepData,
  onClearStep,
  onClearAll,
  localeTexts,
}) {
  // Раньше здесь стояли английские запасные подписи. Вызывающая форма не
  // передавала эти два ключа, запасные значения молча подставлялись — и русский
  // интерфейс показывал «Clear all fields».
  const buttons = localeTexts?.buttons ?? {};

  return (
    <div className={s.clearActions}>
      {hasStepData && (
        <button type="button" className={s.clearStepIcon} onClick={onClearStep}>
          {buttons.clearStep}
        </button>
      )}
      <button className={s.clearAllSteps} type="button" onClick={onClearAll}>
        {buttons.clearAll}
      </button>
    </div>
  );
}
