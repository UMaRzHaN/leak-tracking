import InputCard from "@/features/leakForm/components/InputCard/InputCard";
import Autocomplete from "@/features/search/Autocomplete/Autocomplete";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import { useEnterNavigation } from "@/hooks/useEnterNavigation";
import s from "./StepRenderer.module.scss";

export default function StepRenderer({
  step,
  steps,
  form,
  errors,
  onChange,
  nextStep,
  save,
  ghostPlaceholders,
}) {
  const isLastStep = step >= steps.length;
  const config = steps[step - 1];

  const { handleSubmit, completeFromElement } = useEnterNavigation({
    onLast: () => {
      const hasErrors =
        errors &&
        Object.values(errors).some(
          (v) => v !== undefined && v !== null && v !== "",
        );

      if (hasErrors) return;
      isLastStep ? save() : nextStep();
    },
    headerOffset: 100,
  });

  if (!config) return null;

  return (
    <form
      className={s.stepRenderer}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(e.currentTarget, document.activeElement);
      }}
      onKeyDownCapture={(e) => {
        if (e.key !== "Enter") return;
        if (e.target.tagName === "TEXTAREA") return;

        e.preventDefault();
        handleSubmit(e.currentTarget, e.target);
      }}
    >
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
              placeholder={ghostPlaceholders?.[f.key] ?? f.placeholder}
              hint={f.hint}
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
              onComplete={completeFromElement}
              placeholder={ghostPlaceholders?.[f.key] ?? f.placeholder}
              hint={f.hint}
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
              error={errors?.[f.key]}
            />
          );
        }
        return null;
      })}
      <button
        type="submit"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </form>
  );
}
