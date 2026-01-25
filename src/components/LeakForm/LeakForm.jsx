import { useEffect, useState, useMemo } from "react";
import { STEPS } from "./steps.config";
import StepRenderer from "../Input/StepRenderer";
import { useLeakForm } from "./hooks/useLeakForm";
import { useStepValidation } from "./hooks/useStepValidation";
import s from "./LeakForm.module.scss";

export default function LeakForm({
  onAdd,
  startVoiceInput,
  stopVoiceInput,
  clearVoiceData,
  setPage,
  voiceData,
}) {
  const [step, setStep] = useState(1);

  const { form, errors, handle, setErrors, setForm } = useLeakForm();
  const validateStep = useStepValidation(form, setErrors);

  const isTouchDevice = useMemo(
    () => typeof window !== "undefined" && "ontouchstart" in window,
    [],
  );

  const hasStepData = STEPS[step - 1]?.fields?.some(({ key }) => form[key]);

  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(STEPS.length, v + 1));
  };

  const prevStep = () => {
    setStep((v) => Math.max(1, v - 1));
  };

  const clearForm = () => {
    stopVoiceInput?.();
    clearVoiceData?.();
    setForm({});
    setErrors({});
    setStep(1);
  };

  const clearCurrentStep = () => {
    const currentStep = STEPS[step - 1];
    if (!currentStep?.fields) return;

    setForm((prev) => {
      const updated = { ...prev };

      currentStep.fields.forEach(({ key, type }) => {
        if (type === "photo") {
          delete updated[key];
        } else {
          updated[key] = "";
        }
      });

      return updated;
    });

    setErrors((prev) => {
      const updated = { ...prev };
      currentStep.fields.forEach(({ key }) => {
        delete updated[key];
      });
      return updated;
    });
  };

  const save = () => {
    if (!validateStep(step)) return;

    const d = new Date();
    onAdd?.({
      ...form,
      date: `${String(d.getDate()).padStart(2, "0")}.${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}.${d.getFullYear()}`,
      createdAt: new Date(),
    });

    clearForm();
    setPage("");
  };

  const isLastStep = step === STEPS.length;

  /* ======================================
     APPLY VOICE DATA (STEP-AWARE)
  ====================================== */
  useEffect(() => {
    if (!voiceData) return;

    const currentFields = STEPS[step - 1]?.fields ?? [];
    const allowedKeys = new Set(currentFields.map((f) => f.key));

    setForm((prev) => {
      const updated = { ...prev };

      Object.entries(voiceData).forEach(([key, value]) => {
        if (allowedKeys.has(key)) {
          updated[key] = value;
        }
      });

      return updated;
    });
  }, [voiceData, step, setForm]);

  /* ======================================
     FORCE STOP VOICE INPUT ON UNMOUNT
  ====================================== */
  useEffect(() => {
    return () => {
      stopVoiceInput?.();
    };
  }, [stopVoiceInput]);

  return (
    <div className={s.card}>
      {/* HEADER */}
      <header className={s.appBar}>
        <button
          className={s.backButton}
          type="button"
          onClick={() => {
            stopVoiceInput?.();
            setPage("");
          }}
        >
          ⇦
        </button>

        <div className={s.appBarTitle}>Добавить утечку</div>

        <button
          className={s.mic}
          type="button"
          aria-label="Голосовой ввод"
          onTouchStart={isTouchDevice ? startVoiceInput : undefined}
          onTouchEnd={isTouchDevice ? stopVoiceInput : undefined}
          onTouchCancel={isTouchDevice ? stopVoiceInput : undefined}
          onMouseDown={!isTouchDevice ? startVoiceInput : undefined}
          onMouseUp={!isTouchDevice ? stopVoiceInput : undefined}
          onMouseLeave={!isTouchDevice ? stopVoiceInput : undefined}
        >
          🎙
        </button>
      </header>

      {/* STEP HEADER */}
      <div className={s.stepHeader}>
        <div className={s.stepText}>
          Шаг {step} из {STEPS.length}: <span>{STEPS[step - 1]?.title}</span>
        </div>

        <div className={s.stepDots}>
          {STEPS.map((_, i) => {
            const n = i + 1;
            return (
              <div
                key={n}
                onClick={() => setStep(n)}
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

      {/* BODY */}
      <StepRenderer
        step={step}
        steps={STEPS}
        form={form}
        errors={errors}
        onChange={handle}
      />

      <div className={s.clearActions}>
        {hasStepData && (
          <button
            type="button"
            className={s.clearStepIcon}
            onClick={clearCurrentStep}
            title="Очистить текущий шаг"
          >
            Очистить шаг 🧽
          </button>
        )}

        <button className={s.clearAllSteps} type="button" onClick={clearForm}>
          Очистить все поля 🧹
        </button>
      </div>

      {/* FOOTER */}
      <div className={s.footer}>
        <button onClick={prevStep} disabled={step === 1}>
          ← Назад
        </button>

        {!isLastStep ? (
          <button onClick={nextStep}>Далее →</button>
        ) : (
          <button onClick={save}>💾 Сохранить</button>
        )}
      </div>
    </div>
  );
}
