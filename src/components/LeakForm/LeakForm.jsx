import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useStepValidation } from "./hooks/useStepValidation";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useEffectiveProjectConfig } from "../../app/settings/useEffectiveProjectConfig";
import { useVoiceControl } from "../../app/hooks/useVoiceControl";
import { useLeakFormContext } from "../../context/LeakFormContext";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { calculations } from "../../utils/calculations/calculations";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";
import AddLeakHeader from "./Header/AddLeakHeader";
import AddLeakFooter from "./Footer/AddLeakFooter";
import ConfirmSheet from "../ConfirmSheet/ConfirmSheet";
import VoicePreviewSheet from "../VoicePreviewSheet/VoicePreviewSheet";
import StepRenderer from "../Input/StepRenderer";
import StepHeader from "./components/StepHeader";
import ClearActions from "./components/ClearActions";
import s from "./LeakForm.module.scss";

export default function LeakForm({ onAdd, setPage, prevPage, lastItem, isSaving }) {
  const { form, errors, handle, setErrors, setForm } = useLeakFormContext();
  const rawConfig = useProjectConfig();
  const projectConfig = useEffectiveProjectConfig();
  const { activeProject } = useProject();
  const { vars } = useProjectVars(activeProject?.id ?? null, rawConfig.vars);

  const STEPS = useMemo(() => projectConfig.steps.steps ?? [], [projectConfig]);

  const COPY_KEYS = useMemo(() => {
    const raw = rawConfig.system?.copyable ?? [];
    return raw.map((f) => (typeof f === "string" ? f : f.key));
  }, [rawConfig]);

  const NUMBER_KEYS = useMemo(() => {
    const raw = rawConfig?.system?.numeric ?? [];
    return new Set(raw.map((f) => (typeof f === "string" ? f : f.key)));
  }, [rawConfig]);

  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);
  const topRef = useRef(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  /* ── Navigation ── */
  const validateStep = useStepValidation({ steps: STEPS, form, setErrors });

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(STEPS.length, v + 1));
  }, [validateStep, step, STEPS.length]);

  const prevStep = useCallback(() => setStep((v) => Math.max(1, v - 1)), []);

  /* ── Clear ── */
  const clearForm = useCallback(() => {
    stopVoiceInput?.(); // eslint-disable-line no-use-before-define
    setForm({});
    setErrors({});
    setStep(1);
  }, [setForm, setErrors]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearStep = useCallback(() => {
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
  }, [STEPS, step, setForm, setErrors]);

  /* ── Voice control ── */
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

  /* ── Save ── */
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

  // eslint-disable-next-line no-inner-declarations
  function save() {
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
      <div ref={topRef} className={`${s.card} content`}>
        <AddLeakHeader
          setPage={setPage}
          prevPage={prevPage}
          stopVoiceInput={stopVoiceInput}
          startVoiceInput={startVoiceInput}
        />

        <StepHeader step={step} steps={STEPS} />

        <StepRenderer
          step={step}
          steps={STEPS}
          form={form}
          errors={errors}
          onChange={handle}
          nextStep={nextStep}
          save={save}
        />

        <ClearActions
          hasStepData={hasStepData}
          onClearStep={handleClearStep}
          onClearAll={clearForm}
        />

        <AddLeakFooter
          prevStep={prevStep}
          nextStep={nextStep}
          save={save}
          step={step}
          stepsLength={STEPS.length}
          isSaving={isSaving}
        />
      </div>

      <VoicePreviewSheet
        pending={pendingVoiceData}
        steps={STEPS}
        onConfirm={handleVoiceConfirm}
        onDismiss={dismissVoiceData}
      />

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
