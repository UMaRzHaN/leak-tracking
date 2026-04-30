import { useState, useRef, useMemo, useCallback } from "react";
import { useStepValidation } from "./hooks/useStepValidation";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useEffectiveProjectConfig } from "../../app/settings/useEffectiveProjectConfig";
import { useVoiceControl } from "../../app/hooks/useVoiceControl";
import { useLeakFormContext } from "../../context/LeakFormContext";
import AddLeakHeader from "./Header/AddLeakHeader";
import AddLeakFooter from "./Footer/AddLeakFooter";
import ConfirmSheet from "../ConfirmSheet/ConfirmSheet";
import VoicePreviewSheet from "../VoicePreviewSheet/VoicePreviewSheet";
import StepRenderer from "../Input/StepRenderer";
import s from "./LeakForm.module.scss";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { calculations } from "../../utils/calculations/calculations";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";

export default function LeakForm({
  onAdd,
  setPage,
  prevPage,
  lastItem,
  isSaving,
}) {
  const { form, errors, handle, setErrors, setForm } = useLeakFormContext();
  const rawConfig = useProjectConfig();          // full config — for data processing (numeric, copyable)
  const projectConfig = useEffectiveProjectConfig(); // filtered config — for display (steps, excel)
  const { activeProject } = useProject();
  const { vars } = useProjectVars(activeProject?.id ?? null, rawConfig.vars);

  const STEPS = useMemo(() => projectConfig.steps.steps ?? [], [projectConfig]);

  const COPY_KEYS = useMemo(() => {
    const raw = rawConfig.system?.copyable ?? [];
    return raw.map((f) => (typeof f === "string" ? f : f.key));
  }, [rawConfig]);

  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);

  /* ======================================
     NAVIGATION
  ====================================== */
  const validateStep = useStepValidation({ steps: STEPS, form, setErrors });

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(STEPS.length, v + 1));
  }, [validateStep, step, STEPS.length]);

  const prevStep = useCallback(() => {
    setStep((v) => Math.max(1, v - 1));
  }, []);

  /* ======================================
     CLEAR FORM
  ====================================== */
  const clearForm = useCallback(() => {
    stopVoiceInput?.();
    setForm({});
    setErrors({});
    setStep(1);
  }, [setForm, setErrors]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ======================================
     VOICE CONTROL (step-aware, in-form)
  ====================================== */
  const handleVoiceCommand = useCallback(
    (command) => {
      if (command === "next") nextStep();
      else if (command === "back") prevStep();
      else if (command === "save") save(); // eslint-disable-line no-use-before-define
      else if (command === "clear") clearForm();
    },
    [nextStep, prevStep, clearForm], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { pendingVoiceData, dismissVoiceData, startVoiceInput, stopVoiceInput } =
    useVoiceControl({ step, steps: STEPS, onCommand: handleVoiceCommand });

  const handleVoiceConfirm = useCallback(
    (confirmedData) => {
      setForm((prev) => ({ ...prev, ...confirmedData }));
      dismissVoiceData();
    },
    [setForm, dismissVoiceData],
  );

  /* ======================================
     FINAL SAVE
  ====================================== */
  const NUMBER_KEYS = useMemo(() => {
    const raw = rawConfig?.system?.numeric ?? [];
    return new Set(raw.map((f) => (typeof f === "string" ? f : f.key)));
  }, [rawConfig]);

  const commitSave = useCallback(
    (data) => {
      const d = new Date();
      const coerced = { ...data };
      NUMBER_KEYS.forEach((key) => {
        if (coerced[key] !== undefined) coerced[key] = normalizeNumber(coerced[key]);
      });
      const calculated = vars ? calculations(coerced, vars) : coerced;
      onAdd?.({
        ...calculated,
        date: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`,
        createdAt: new Date(),
      });
      clearForm();
      setPage("");
    },
    [NUMBER_KEYS, vars, onAdd, clearForm, setPage],
  );

  /* ======================================
     SAVE WITH CONFIRM
  ====================================== */
  // eslint-disable-next-line no-inner-declarations
  function save() {
    console.log("save");
    
    if (!validateStep(step)) return;
    const finalData = { ...form, photo: form.photo };

    if (!lastItem) { commitSave(finalData); return; }

    const isEmptyValue = (v) =>
      v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const emptyKeys = COPY_KEYS.filter((key) => key !== "photo" && isEmptyValue(finalData[key]));

    if (emptyKeys.length === 0) { commitSave(finalData); return; }

    pendingKeysRef.current = emptyKeys;
    setConfirmOpen(true);
  }

  /* ======================================
     CONFIRM HANDLERS
  ====================================== */
  const handleConfirmCopy = () => {
    const merged = { ...form, photo: form.photo };
    pendingKeysRef.current.forEach((key) => {
      if (lastItem[key] !== undefined) merged[key] = lastItem[key];
    });
    setConfirmOpen(false);
    commitSave(merged);
  };

  const handleCancelCopy = () => {
    setConfirmOpen(false);
    commitSave({ ...form, photo: form.photo });
  };

  const hasStepData = STEPS[step - 1]?.fields?.some(({ key }) => form[key]);

  return (
    <>
      <div className={`${s.card} content`}>
        {/* ===== HEADER ===== */}
        <AddLeakHeader
          setPage={setPage}
          prevPage={prevPage}
          stopVoiceInput={stopVoiceInput}
          startVoiceInput={startVoiceInput}
        />

        {/* ===== STEP HEADER ===== */}
        <div className={s.stepHeader}>
          <div className={s.stepMeta}>
            <div>
              <div className={s.stepLabel}>Шаг {step} из {STEPS.length}</div>
              <div className={s.stepTitle}>{STEPS[step - 1]?.title}</div>
            </div>
            <div className={s.stepDots}>
              {STEPS.map((_, i) => {
                const n = i + 1;
                return (
                  <div
                    key={n}
                    className={[s.stepDot, n < step && s.done, n === step && s.active]
                      .filter(Boolean).join(" ")}
                  >
                    {n}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={s.progressTrack}>
            <div className={s.progressFill} style={{ width: `${(step / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {/* ===== BODY ===== */}
        <StepRenderer
          step={step}
          steps={STEPS}
          form={form}
          errors={errors}
          onChange={handle}
          nextStep={nextStep}
          save={save}
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
                  currentStep.fields.forEach(({ key }) => { delete updated[key]; });
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
          isSaving={isSaving}
        />
      </div>

      {/* ===== VOICE PREVIEW ===== */}
      <VoicePreviewSheet
        pending={pendingVoiceData}
        steps={STEPS}
        onConfirm={handleVoiceConfirm}
        onDismiss={dismissVoiceData}
      />

      {/* ===== CONFIRM COPY SHEET ===== */}
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
