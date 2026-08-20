import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useStepValidation } from "./hooks/useStepValidation";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import { useEffectiveProjectConfig } from "@/app/project/hooks/useEffectiveProjectConfig";
import { useVoiceControl } from "@/app/hooks/useVoiceControl";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { useProjectData } from "@/app/project/ProjectContext";
import { useProjectVars } from "@/app/project/hooks/useProjectVars";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  linkLeakToComponent,
  unlinkLeakComponent,
} from "@/domain/leakComponentLink";
import { calculateLeakWithSnapshot } from "@/utils/calculationParams";
import { getLeakCalculationFieldErrors } from "@/utils/calculations/calculations";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { localizeAutocompleteOptions } from "@/features/search/Autocomplete/optionTranslations";
import AddLeakHeader from "./Header/AddLeakHeader";
import AddLeakFooter from "./Footer/AddLeakFooter";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import VoicePreviewSheet from "@/features/voice/VoicePreviewSheet/VoicePreviewSheet";
import StepRenderer from "@/features/leakForm/components/StepRenderer/StepRenderer";
import ClearActions from "./components/ClearActions";
import SettingsModal from "@/features/settings/SettingsModal/SettingsModal";
import { getCopyPreviousKeys } from "@/features/leakForm/utils/copyPrevious";
import { buildGhostPlaceholders } from "@/features/leakForm/utils/ghostPlaceholders";
import { hasRestorablePhoto } from "@/utils/restorablePhoto";
import { shortFieldLabel } from "@/utils/fieldLabels";
import s from "./LeakForm.module.scss";

const STEP_TITLE_KEYS = {
  Основное: "basic",
  "МТР и Описание *": "mtrAndDescription",
  "Примечание и фото": "noteAndPhoto",
};

function localizeStep(step, t, lang, projectType) {
  return {
    ...step,
    title:
      STEP_TITLE_KEYS[step.title] != null
        ? t(`addLeak.stepTitles.${STEP_TITLE_KEYS[step.title]}`)
        : step.title,
    fields: step.fields.map((field) => ({
      ...field,
      label: shortFieldLabel(field.key, t, field.label),
      // Hints read from the locale in both languages: measured across the
      // three project configs, all 25 of them are word-for-word identical per
      // field, so one key carries them.
      hint: t(`addLeak.fields.${field.key}.hint`, { defaultValue: "" }),
      // Placeholders are domain examples, and three of them (location, object,
      // category) differ per project type — hence the suffixed key, which
      // falls back to the shared one for the other twenty-one.
      placeholder: t(
        [
          `addLeak.fields.${field.key}.placeholder_${projectType}`,
          `addLeak.fields.${field.key}.placeholder`,
        ],
        { defaultValue: "" },
      ),
      // Autocomplete options are dictionary values rather than interface text,
      // so they are translated from the data side, not through a locale key.
      ...(lang === "en"
        ? {
            options:
              field.type === "autocomplete"
                ? localizeAutocompleteOptions(field.options ?? [], "en")
                : field.options,
          }
        : null),
    })),
  };
}

function localizeSteps(steps, t, lang, projectType) {
  return steps.map((step) => localizeStep(step, t, lang, projectType));
}

export default function LeakForm({
  onAdd,
  onSaved,
  onBack,
  lastItem,
  isSaving,
  coords = null,
}) {
  const { form, errors, handle, setErrors, setForm } = useLeakFormContext();
  const { t, lang } = useLanguage();
  const rawConfig = useProjectConfig();
  const projectConfig = useEffectiveProjectConfig();
  const { activeProject } = useProjectData();
  const { leakPhotoRequired } = usePhotoRequirements(activeProject?.id ?? null);
  const { vars, setVars } = useProjectVars(
    activeProject?.id ?? null,
    rawConfig.vars,
  );
  const [calcSettingsOpen, setCalcSettingsOpen] = useState(false);

  const localeTexts = useMemo(
    () => ({
      pageTitle: t("addLeak.pageTitle"),
      stepPrefix: t("addLeak.stepPrefix"),
      buttons: {
        prev: t("addLeak.buttons.prev"),
        next: t("addLeak.buttons.next"),
        save: t("addLeak.buttons.save"),
        saving: t("addLeak.buttons.saving"),
        clearStep: t("addLeak.buttons.clearStep"),
        clearAll: t("addLeak.buttons.clearAll"),
      },
      confirm: {
        title: t("addLeak.confirm.title"),
        description: t("addLeak.confirm.description"),
        confirmLabel: t("addLeak.confirm.confirmLabel"),
        cancelLabel: t("addLeak.confirm.cancelLabel"),
      },
    }),
    [t],
  );

  const STEPS = useMemo(
    () =>
      (projectConfig.steps.steps ?? []).map((item) => ({
        ...item,
        fields: item.fields.map((field) =>
          field.type === "photo" && field.key === "photo"
            ? { ...field, required: leakPhotoRequired }
            : field,
        ),
      })),
    [leakPhotoRequired, projectConfig],
  );
  const translatedSteps = useMemo(
    () => localizeSteps(STEPS, t, lang, activeProject?.type),
    [STEPS, activeProject?.type, lang, t],
  );

  const COPY_KEYS = useMemo(() => {
    const raw = rawConfig.system?.copyable ?? [];
    return getCopyPreviousKeys(raw);
  }, [rawConfig]);

  const NUMBER_KEYS = useMemo(() => {
    const raw = rawConfig?.system?.numeric ?? [];
    return new Set(raw.map((f) => (typeof f === "string" ? f : f.key)));
  }, [rawConfig]);

  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);
  const topRef = useRef(null);
  const stopVoiceInputRef = useRef(null);
  const saveRef = useRef(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  /* Navigation */
  const validateStep = useStepValidation({
    steps: STEPS,
    form,
    setErrors,
    calculationVars: vars,
  });

  const validateAllSteps = useCallback(() => {
    const nextErrors = {};
    let firstInvalidStep = null;

    STEPS.forEach((item, index) => {
      item.fields?.forEach(({ key, required, type }) => {
        if (!required) return;

        if (type === "photo") {
          const photo = form[key];
          if (!hasRestorablePhoto(photo)) {
            nextErrors[key] = t("leakForm.validation.photoRequired");
            firstInvalidStep ??= index + 1;
          }
          return;
        }

        const value = form[key];
        const empty =
          value == null || (typeof value === "string" && value.trim() === "");

        if (empty) {
          nextErrors[key] = t("leakForm.validation.required");
          firstInvalidStep ??= index + 1;
        }
      });
    });

    const calculationErrors = getLeakCalculationFieldErrors(form, vars);
    Object.entries(calculationErrors).forEach(([key, code]) => {
      nextErrors[key] = t(`leakForm.validation.${code}`);
      const invalidStep = STEPS.findIndex((item) =>
        item.fields?.some((field) => field.key === key),
      );
      if (invalidStep >= 0) firstInvalidStep ??= invalidStep + 1;
    });

    setErrors(nextErrors);
    if (firstInvalidStep != null) {
      setStep(firstInvalidStep);
      return false;
    }
    return true;
  }, [STEPS, form, setErrors, t, vars]);

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(STEPS.length, v + 1));
  }, [validateStep, step, STEPS.length]);

  const prevStep = useCallback(() => setStep((v) => Math.max(1, v - 1)), []);

  /* Clear */
  const clearForm = useCallback(() => {
    stopVoiceInputRef.current?.();
    setForm({});
    setErrors({});
    setStep(1);
  }, [setForm, setErrors]);

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
      currentStep.fields.forEach(({ key }) => {
        delete updated[key];
      });
      return updated;
    });
  }, [STEPS, step, setForm, setErrors]);

  /* Voice control */
  const handleVoiceCommand = useCallback(
    (command) => {
      if (command === "next") nextStep();
      else if (command === "back") prevStep();
      else if (command === "save") saveRef.current?.();
      else if (command === "clear") clearForm();
    },
    [nextStep, prevStep, clearForm],
  );

  const {
    pendingVoiceData,
    dismissVoiceData,
    startVoiceInput,
    stopVoiceInput,
  } = useVoiceControl({ step, steps: STEPS, onCommand: handleVoiceCommand });

  useEffect(() => {
    stopVoiceInputRef.current = stopVoiceInput;
  }, [stopVoiceInput]);

  const handleVoiceConfirm = useCallback(
    (confirmedData) => {
      setForm((prev) => ({ ...prev, ...confirmedData }));
      dismissVoiceData();
    },
    [setForm, dismissVoiceData],
  );

  /* Save */
  const commitSave = useCallback(
    async (data) => {
      const d = new Date();
      const coerced = { ...data };
      NUMBER_KEYS.forEach((key) => {
        if (coerced[key] !== undefined) {
          coerced[key] = normalizeNumber(coerced[key]);
        }
      });
      const calculated = vars
        ? calculateLeakWithSnapshot(coerced, vars)
        : coerced;
      const saved = await onAdd?.({
        ...calculated,
        date: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`,
        createdAt: new Date(),
      });
      if (!saved) return;
      clearForm();
      onSaved?.(saved);
    },
    [NUMBER_KEYS, vars, onAdd, clearForm, onSaved],
  );

  const save = useCallback(() => {
    if (!validateAllSteps()) return;

    const finalData = { ...form, photo: form.photo };

    if (!lastItem) {
      void commitSave(finalData);
      return;
    }

    const isEmptyValue = (v) =>
      v === null ||
      v === undefined ||
      (typeof v === "string" && v.trim() === "");
    const emptyKeys = COPY_KEYS.filter((key) => {
      if (key === "photo") return false;
      if (!isEmptyValue(finalData[key])) return false;
      const lastVal = lastItem[key];
      return lastVal != null && String(lastVal).trim() !== "";
    });

    if (emptyKeys.length === 0) {
      void commitSave(finalData);
      return;
    }

    pendingKeysRef.current = emptyKeys;
    setConfirmOpen(true);
  }, [COPY_KEYS, commitSave, form, lastItem, validateAllSteps]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const handleConfirmCopy = () => {
    const merged = { ...form, photo: form.photo };
    pendingKeysRef.current.forEach((key) => {
      if (lastItem[key] !== undefined) merged[key] = lastItem[key];
    });
    setConfirmOpen(false);
    void commitSave(merged);
  };

  const handleCancelCopy = () => {
    setConfirmOpen(false);
    void commitSave({ ...form, photo: form.photo });
  };

  const ghostPlaceholders = useMemo(
    () => buildGhostPlaceholders(lastItem, STEPS[step - 1]?.fields, form),
    [lastItem, STEPS, step, form],
  );

  const hasStepData = translatedSteps[step - 1]?.fields?.some(
    ({ key }) => form[key],
  );

  return (
    <>
      <div ref={topRef} className={`${s.card} content`}>
        <AddLeakHeader
          onBack={onBack}
          stopVoiceInput={stopVoiceInput}
          startVoiceInput={startVoiceInput}
          step={step}
          steps={translatedSteps}
          title={localeTexts.pageTitle}
          localeTexts={localeTexts}
        />

        <div className={s.calcShortcut}>
          <div className={s.calcShortcutText}>
            <strong>{t("settings.calculationParameters")}</strong>
            <span>{t("leakForm.calcShortcutHint")}</span>
          </div>
          <button type="button" onClick={() => setCalcSettingsOpen(true)}>
            {t("settings.editParameters")}
          </button>
        </div>

        <StepRenderer
          step={step}
          steps={translatedSteps}
          form={form}
          errors={errors}
          onChange={handle}
          nextStep={nextStep}
          save={save}
          ghostPlaceholders={ghostPlaceholders}
          componentLink={{
            project: activeProject,
            coords,
            onPick: (component) =>
              setForm((current) => linkLeakToComponent(current, component)),
            onUnlink: () => setForm((current) => unlinkLeakComponent(current)),
          }}
        />

        <ClearActions
          hasStepData={hasStepData}
          onClearStep={handleClearStep}
          onClearAll={clearForm}
          localeTexts={localeTexts}
        />

        <AddLeakFooter
          prevStep={prevStep}
          nextStep={nextStep}
          save={save}
          step={step}
          stepsLength={translatedSteps.length}
          isSaving={isSaving}
          localeTexts={localeTexts}
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
        title={localeTexts.confirm.title}
        description={localeTexts.confirm.description}
        confirmLabel={localeTexts.confirm.confirmLabel}
        cancelLabel={localeTexts.confirm.cancelLabel}
        onConfirm={handleConfirmCopy}
        onCancel={handleCancelCopy}
      />

      <SettingsModal
        open={calcSettingsOpen}
        onClose={() => setCalcSettingsOpen(false)}
        variables={vars}
        onSave={setVars}
      />
    </>
  );
}
