import s from "@/features/leakForm/LeakForm.module.scss";

export default function StepHeader({ step, steps }) {
  return (
    <div className={s.stepHeader}>
      <div className={s.stepMeta}>
        <div>
          <div className={s.stepLabel}>
            Шаг {step} из {steps.length}
          </div>
          <div className={s.stepTitle}>{steps[step - 1]?.title}</div>
        </div>
        <div className={s.stepDots}>
          {steps.map((_, i) => {
            const n = i + 1;
            return (
              <div
                key={n}
                className={[
                  s.stepDot,
                  n < step && s.done,
                  n === step && s.active,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {n}
              </div>
            );
          })}
        </div>
      </div>
      <div className={s.progressTrack}>
        <div
          className={s.progressFill}
          style={{ width: `${(step / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
