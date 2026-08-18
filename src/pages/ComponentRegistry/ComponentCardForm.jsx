import { useCallback, useMemo, useRef, useState } from "react";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import PageHeader from "@/components/layout/PageHeader/PageHeader";
import AddLeakFooter from "@/features/leakForm/Footer/AddLeakFooter";
import ClearActions from "@/features/leakForm/components/ClearActions";
import StepRenderer from "@/features/leakForm/components/StepRenderer/StepRenderer";
import {
  isValidComponentUid,
  missingRequiredFields,
} from "@/domain/componentRegistry";
import { isValidLatitude, isValidLongitude } from "@/utils/coordinates";
import { toNullableNumber } from "@/utils/normalize/toNullableNumber";
import { COMPONENT_NAME_TRANSLATIONS } from "@/data/component/componentDictionary";
import { getCopyPreviousKeys } from "@/features/leakForm/utils/copyPrevious";
import leak from "@/features/leakForm/LeakForm.module.scss";
import s from "./ComponentRegistry.module.scss";

/**
 * The card a walker fills in standing in front of a piece of equipment.
 *
 * Built from the leak form's own parts — PageHeader, StepRenderer, ClearActions,
 * AddLeakFooter and its stylesheet — so a walker moving between the two screens
 * meets the same interface twice rather than two dialects of one.
 *
 * What differs is the rules, not the look. A duplicate identity number warns but
 * never refuses: the app cannot see another device's numbers, so refusing would
 * only strand somebody at a wellhead. And coordinates are stamped from the
 * receiver without ever being asked for, the way a leak records them.
 */
export default function ComponentCardForm({
  steps,
  coords = null,
  copyableFields = [],
  lastComponent = null,
  component = null,
  suggestUid,
  findConflicts,
  onSave,
  onCancel,
  texts,
}) {
  const isEditing = Boolean(component?.id);

  const [form, setForm] = useState(() =>
    isEditing
      ? { ...component }
      : {
          component_uid: suggestUid?.() ?? "",
          // Stamped once, when the card is opened, rather than at save: the
          // walker is standing at the equipment now, and by the time the
          // passport fields are filled in they may have moved on.
          lat: toNullableNumber(coords?.lat) ?? "",
          lng: toNullableNumber(coords?.lng) ?? "",
        },
  );
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingKeysRef = useRef([]);

  const required = useMemo(
    () =>
      steps.flatMap((s) =>
        s.fields.filter((f) => f.required).map((f) => f.key),
      ),
    [steps],
  );

  const conflicts = useMemo(
    () => findConflicts?.(form.component_uid, component?.id) ?? [],
    [findConflicts, form.component_uid, component?.id],
  );

  const handleChange = useCallback((key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Typing the Russian name fills the English one, so the operator names a
      // component once instead of twice. Only when the English field is still
      // untouched — an edited value is never overwritten.
      if (key === "component_name" && !current.component_name_en) {
        const translated = COMPONENT_NAME_TRANSLATIONS[value];
        if (translated) next.component_name_en = translated;
      }
      return next;
    });
    setErrors((current) =>
      current[key] ? { ...current, [key]: undefined } : current,
    );
  }, []);

  /** The first step carrying one of these keys, so an error is never hidden. */
  const stepOf = useCallback(
    (keys) => {
      for (const [index, formStep] of steps.entries()) {
        if (formStep.fields.some((field) => keys.includes(field.key))) {
          return index + 1;
        }
      }
      return 1;
    },
    [steps],
  );

  const validate = useCallback(() => {
    const next = {};
    for (const key of missingRequiredFields(form, required)) {
      next[key] = texts.errors.required;
    }
    if (form.component_uid && !isValidComponentUid(form.component_uid)) {
      next.component_uid = texts.errors.digitsOnly;
    }
    // A coordinate typed by hand can land anywhere; one that is out of range
    // would put the component on the far side of the planet on the map.
    if (
      form.lat !== "" &&
      form.lat != null &&
      !isValidLatitude(Number(form.lat))
    ) {
      next.lat = texts.errors.badCoordinate;
    }
    if (
      form.lng !== "" &&
      form.lng != null &&
      !isValidLongitude(Number(form.lng))
    ) {
      next.lng = texts.errors.badCoordinate;
    }
    setErrors(next);
    return Object.keys(next);
  }, [form, required, texts]);

  /**
   * Copyable fields the operator left empty that the previous card can fill.
   *
   * Only the empty ones: what was typed here describes the equipment in front
   * of the walker and is never overwritten by the card before it.
   */
  const findFillableKeys = useCallback(
    (candidate) => {
      if (!lastComponent) return [];
      return getCopyPreviousKeys(copyableFields).filter((key) => {
        const current = candidate[key];
        if (current != null && String(current).trim() !== "") return false;
        const previous = lastComponent[key];
        return previous != null && String(previous).trim() !== "";
      });
    },
    [copyableFields, lastComponent],
  );

  const commitSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        await onSave(payload);
      } finally {
        setSaving(false);
      }
    },
    [onSave],
  );

  const handleConfirmCopy = useCallback(() => {
    const merged = { ...form };
    for (const key of pendingKeysRef.current) merged[key] = lastComponent[key];
    setConfirmOpen(false);
    void commitSave(merged);
  }, [commitSave, form, lastComponent]);

  const handleCancelCopy = useCallback(() => {
    setConfirmOpen(false);
    void commitSave({ ...form });
  }, [commitSave, form]);

  const handleSave = useCallback(async () => {
    const failed = validate();
    if (failed.length > 0) {
      // Land on the step that actually holds the problem. Saving is allowed
      // from any step, so a fixed jump to the first one would hide an error
      // sitting three steps away and look like a button that does nothing.
      setStep(stepOf(failed));
      return;
    }
    const fillable = findFillableKeys(form);
    if (fillable.length === 0) {
      await commitSave(form);
      return;
    }

    // Offered rather than applied: a blank passport field may mean "same as the
    // last one" or "the plate was unreadable", and only the person holding the
    // card knows which.
    pendingKeysRef.current = fillable;
    setConfirmOpen(true);
  }, [commitSave, findFillableKeys, form, stepOf, validate]);

  /**
   * What the previous card held, shown as placeholder text in the empty fields
   * of the current step — the same affordance the leak form gives.
   *
   * Only fields marked copyable in the config: the identity number is suggested
   * from the highest already used, and coordinates belong to this piece of
   * equipment, so neither should echo the card before it.
   */
  const ghostPlaceholders = useMemo(() => {
    if (!lastComponent) return {};

    const copyable = new Set(getCopyPreviousKeys(copyableFields));
    const result = {};
    for (const field of steps[step - 1]?.fields ?? []) {
      if (field.type === "photo" || !copyable.has(field.key)) continue;

      const current = form[field.key];
      if (current != null && String(current).trim() !== "") continue;

      const previous = lastComponent[field.key];
      if (previous != null && String(previous).trim() !== "") {
        result[field.key] = String(previous);
      }
    }
    return result;
  }, [copyableFields, form, lastComponent, step, steps]);

  const hasStepData = (steps[step - 1]?.fields ?? []).some(
    ({ key }) => form[key] != null && String(form[key]).trim() !== "",
  );

  /**
   * Clearing leaves the identity number and the recorded fix alone: one is the
   * card's identity and the other is where the walker is standing, and neither
   * is something the button is meant to throw away.
   */
  const keepOnClear = useCallback(
    (current) => ({
      component_uid: current.component_uid,
      lat: current.lat,
      lng: current.lng,
    }),
    [],
  );

  const clearStep = useCallback(() => {
    setForm((current) => {
      const next = { ...current };
      for (const field of steps[step - 1]?.fields ?? []) {
        if (field.key in keepOnClear(current)) continue;
        delete next[field.key];
      }
      return next;
    });
    setErrors({});
  }, [keepOnClear, step, steps]);

  const clearAll = useCallback(() => {
    setForm((current) => keepOnClear(current));
    setErrors({});
    setStep(1);
  }, [keepOnClear]);

  return (
    <div className={`${leak.card} content`}>
      <PageHeader
        title={isEditing ? texts.editTitle : texts.addTitle}
        subtitle={`${texts.stepPrefix} ${step} / ${steps.length} · ${
          steps[step - 1]?.title ?? ""
        }`}
        badge={`${step}/${steps.length}`}
        backLabel={texts.cancel}
        onBack={onCancel}
      />

      {conflicts.length > 0 && (
        <p className={s.warning} role="status">
          {texts.duplicateWarning(conflicts.length)}
        </p>
      )}

      <StepRenderer
        step={step}
        steps={steps}
        form={form}
        errors={errors}
        onChange={handleChange}
        nextStep={() => setStep((value) => Math.min(value + 1, steps.length))}
        save={handleSave}
        ghostPlaceholders={ghostPlaceholders}
      />

      <ClearActions
        hasStepData={hasStepData}
        onClearStep={clearStep}
        onClearAll={clearAll}
        localeTexts={texts}
      />

      <AddLeakFooter
        prevStep={() => setStep((value) => Math.max(1, value - 1))}
        nextStep={() => setStep((value) => Math.min(value + 1, steps.length))}
        save={handleSave}
        step={step}
        stepsLength={steps.length}
        isSaving={saving}
        localeTexts={texts}
      />

      <ConfirmSheet
        open={confirmOpen}
        title={texts.copyConfirm.title}
        description={texts.copyConfirm.description}
        confirmLabel={texts.copyConfirm.confirmLabel}
        cancelLabel={texts.copyConfirm.cancelLabel}
        onConfirm={handleConfirmCopy}
        onCancel={handleCancelCopy}
      />
    </div>
  );
}
