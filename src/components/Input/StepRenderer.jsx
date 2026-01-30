import { useMemo } from "react";
import InputCard from "./InputCard";
import Autocomplete from "./Autocomplete";
import PhotoInput from "./PhotoInput";
import { useEnterNavigation } from "../../hooks/useEnterNavigation";
import s from "./Input.module.scss";

export default function StepRenderer({
  step,
  steps,
  form,
  errors,
  onChange,
  nextStep,
  save,
}) {
  const isLastStep = step >= steps.length;

  // ❗ config может быть undefined — это ОК
  const config = steps[step - 1];

  // 🔹 ВСЕ хуки — ДО return
  const focusableFields = useMemo(() => {
    if (!config) return [];
    return config.fields.filter((f) => f.type !== "photo");
  }, [config]);

  const lastFieldKey = focusableFields.length
    ? focusableFields.at(-1).key
    : null;

  const { handleEnter } = useEnterNavigation({
    onLast: () => {
      if (errors && Object.keys(errors).length > 0) return;
      isLastStep ? save() : nextStep();
    },
    headerOffset: 56,
  });

  // ⛔ return ТОЛЬКО ПОСЛЕ хуков
  if (!config) return null;

  const canHandleEnter = (f) =>
    lastFieldKey !== null && f.key === lastFieldKey;

  return (
    <div className={s.stepRenderer}>
      {config.fields.map((f) => {
        if (f.type === "input" || f.type === "textarea") {
          return (
            <InputCard
              key={f.key}
              as={f.type === "textarea" ? "textarea" : "input"}
              rows={f.type === "textarea" ? 4 : undefined}
              label={f.label}
              type={f.number ? "number" : "text"}
              required={f.required}
              value={form[f.key]}
              error={errors?.[f.key]}
              onChange={(v) => onChange(f.key, v)}
              onEnter={canHandleEnter(f) ? handleEnter : undefined}
            />
          );
        }

        if (f.type === "autocomplete") {
          return (
            <Autocomplete
              key={f.key}
              id={f.key}
              label={f.label}
              value={form[f.key]}
              options={f.options}
              error={errors?.[f.key]}
              onChange={(v) => onChange(f.key, v)}
              required={f.required}
              onEnter={canHandleEnter(f) ? handleEnter : undefined}
            />
          );
        }

        if (f.type === "photo") {
          return (
            <PhotoInput
              key={f.key}
              required={f.required}
              value={form.photo}
              onChange={(photo) => onChange("photo", photo)}
              label={f.label}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
