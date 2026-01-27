import { useEffect, useState, useRef, useMemo } from "react";
import { useLeakForm } from "./hooks/useLeakForm";
import { useStepValidation } from "./hooks/useStepValidation";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import AddLeakHeader from "./AddLeakHeader";
import AddLeakFooter from "./AddLeakFooter";
import ConfirmSheet from "../ConfirmSheet/ConfirmSheet";
import StepRenderer from "../Input/StepRenderer";
import s from "./LeakForm.module.scss";

/* ======================================
   FIELDS ALLOWED TO COPY
====================================== */

export default function LeakForm({
  onAdd,
  startVoiceInput,
  stopVoiceInput,
  clearVoiceData,
  setPage,
  voiceData,
  lastItem,
}) {
  const projectConfig = useProjectConfig();

  const STEPS = useMemo(() => projectConfig.steps.steps ?? [], [projectConfig]);

  const COPYABLE_FIELDS = useMemo(
    () => projectConfig.system?.copyable ?? [],
    [projectConfig],
  );

  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);

  const { form, errors, handle, setErrors, setForm } = useLeakForm();
  const validateStep = useStepValidation({ steps: STEPS, form, setErrors });

  const hasStepData = STEPS[step - 1]?.fields?.some(({ key }) => form[key]);

  /* ======================================
     NAVIGATION
  ====================================== */
  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(STEPS.length, v + 1));
  };

  const prevStep = () => {
    setStep((v) => Math.max(1, v - 1));
  };

  /* ======================================
     CLEAR FORM
  ====================================== */
  const clearForm = () => {
    stopVoiceInput?.();
    clearVoiceData?.();
    setForm({});
    setErrors({});
    setStep(1);
  };

  /* ======================================
     FINAL SAVE (NO COPY LOGIC)
  ====================================== */
  const commitSave = (data) => {
    const d = new Date();

    onAdd?.({
      ...data,
      date: `${String(d.getDate()).padStart(2, "0")}.${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}.${d.getFullYear()}`,
      createdAt: new Date(),
    });

    clearForm();
    setPage("");
  };

  /* ======================================
     SAVE WITH CONFIRM
  ====================================== */
  const save = () => {
    if (!validateStep(step)) return;

    // 🔑 Фото всегда сохраняем как есть
    const finalData = {
      ...form,
      photo: form.photo,
    };

    if (!lastItem) {
      commitSave(finalData);
      return;
    }

    const emptyKeys = COPYABLE_FIELDS.filter(
      (key) =>
        finalData[key] === "" ||
        finalData[key] === null ||
        finalData[key] === undefined,
    );

    if (emptyKeys.length === 0) {
      commitSave(finalData);
      return;
    }

    pendingKeysRef.current = emptyKeys;
    setConfirmOpen(true);
  };

  /* ======================================
     CONFIRM HANDLERS
  ====================================== */
  const handleConfirmCopy = () => {
    const merged = {
      ...form,
      photo: form.photo, // 🔑 фото НЕ теряется
    };

    pendingKeysRef.current.forEach((key) => {
      if (lastItem[key] !== undefined) {
        merged[key] = lastItem[key];
      }
    });

    setConfirmOpen(false);
    commitSave(merged);
  };

  const handleCancelCopy = () => {
    setConfirmOpen(false);
    commitSave({
      ...form,
      photo: form.photo,
    });
  };

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
  }, [voiceData, step, setForm, STEPS]);

  return (
    <>
      <div className={s.card}>
        {/* ===== HEADER ===== */}
        <AddLeakHeader
          setPage={setPage}
          stopVoiceInput={stopVoiceInput}
          startVoiceInput={startVoiceInput}
        />

        {/* ===== STEP HEADER ===== */}
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

        {/* ===== BODY ===== */}
        <StepRenderer
          step={step}
          steps={STEPS}
          form={form}
          errors={errors}
          onChange={handle}
        />

        {/* ===== CLEAR ACTIONS ===== */}
        <div className={s.clearActions}>
          {hasStepData && (
            <button
              type="button"
              className={s.clearStepIcon}
              onClick={() => {
                const currentStep = STEPS[step - 1];
                if (!currentStep?.fields) return;

                setForm((prev) => {
                  const updated = { ...prev };
                  currentStep.fields.forEach(({ key, type }) => {
                    if (type === "photo") delete updated[key];
                    else updated[key] = "";
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
              }}
            >
              Очистить шаг 🧽
            </button>
          )}

          <button className={s.clearAllSteps} type="button" onClick={clearForm}>
            Очистить все поля 🧹
          </button>
        </div>

        {/* ===== FOOTER ===== */}
        <AddLeakFooter
          prevStep={prevStep}
          nextStep={nextStep}
          save={save}
          step={step}
          stepsLength={STEPS.length}
        />
      </div>

      {/* ===== CONFIRM SHEET ===== */}
      <ConfirmSheet
        open={confirmOpen}
        title="Заполнить из предыдущей записи?"
        description="Некоторые поля пустые. Скопировать значения?"
        onConfirm={handleConfirmCopy}
        onCancel={handleCancelCopy}
      />
    </>
  );
}
