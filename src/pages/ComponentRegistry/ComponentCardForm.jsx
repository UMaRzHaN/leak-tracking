import { useCallback, useMemo, useState } from "react";
import StepRenderer from "@/features/leakForm/components/StepRenderer/StepRenderer";
import { getComponentSteps } from "@/configs/projectAdapter";
import {
  isValidComponentUid,
  missingRequiredFields,
} from "@/domain/componentRegistry";
import { COMPONENT_NAME_TRANSLATIONS } from "@/data/component/componentDictionary";
import s from "./ComponentRegistry.module.scss";

/**
 * The card a walker fills in standing in front of a piece of equipment.
 *
 * Two things separate it from the leak form. Only the first step can block
 * saving — a plate that is worn off or buried under insulation is the normal
 * case, so steps two and three are always skippable. And a duplicate identity
 * number warns but never refuses: the app cannot see another device's numbers,
 * so refusing here would only strand somebody at a wellhead.
 */
export default function ComponentCardForm({
  project,
  component = null,
  suggestUid,
  findConflicts,
  onSave,
  onCancel,
  texts,
}) {
  const steps = useMemo(() => getComponentSteps(project).steps, [project]);
  const isEditing = Boolean(component?.id);

  const [form, setForm] = useState(() =>
    isEditing ? { ...component } : { component_uid: suggestUid?.() ?? "" },
  );
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

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

  const validate = useCallback(() => {
    const next = {};
    for (const key of missingRequiredFields(form, required)) {
      next[key] = texts.errors.required;
    }
    if (form.component_uid && !isValidComponentUid(form.component_uid)) {
      next.component_uid = texts.errors.digitsOnly;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, required, texts]);

  const handleSave = useCallback(async () => {
    if (!validate()) {
      // Required fields all live on step one; send the operator back to them
      // rather than leaving an error nobody can see.
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }, [form, onSave, validate]);

  const isLastStep = step >= steps.length;

  return (
    <div className={s.form}>
      <header className={s.formHead}>
        <h2>{isEditing ? texts.editTitle : texts.addTitle}</h2>
        <p className={s.stepLabel}>
          {texts.stepPrefix} {step}/{steps.length} — {steps[step - 1]?.title}
        </p>
      </header>

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
        ghostPlaceholders={null}
      />

      <footer className={s.formFoot}>
        <button type="button" onClick={onCancel} disabled={saving}>
          {texts.cancel}
        </button>
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((value) => value - 1)}
            disabled={saving}
          >
            {texts.prev}
          </button>
        )}
        {!isLastStep && (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={saving}
          >
            {texts.next}
          </button>
        )}
        {/* Saving is allowed from any step: the card is expected to be
            incomplete, and forcing a walk through empty passport fields would
            only teach people to fill them with dashes. */}
        <button
          type="button"
          className={s.primary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? texts.saving : texts.save}
        </button>
      </footer>
    </div>
  );
}
