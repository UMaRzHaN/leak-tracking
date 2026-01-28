import InputCard from "./InputCard";
import AutocompleteInput from "./AutocompleteInput";
import PhotoInput from "./PhotoInput";
import s from "./Input.module.scss";

export default function StepRenderer({ step, steps, form, errors, onChange }) {
  const config = steps[step - 1];
  if (!config) return null;

  return (
    <div className={s.stepRenderer}>
      {config.fields.map((f) => {
        if (f.type === "input" || f.type === "textarea") {
          return (
            <InputCard
              as={f.type === "textarea" ? "textarea" : "input"}
              rows={f.type === "textarea" ? 4 : undefined}
              key={f.key}
              label={f.label}
              type={f.number ? "number" : "text"}
              required={f.required}
              value={form[f.key]}
              error={errors[f.key]}
              onChange={(v) => onChange(f.key, v)}
            />
          );
        }

        if (f.type === "autocomplete") {
          return (
            <AutocompleteInput
              key={f.key}
              id={f.key}
              label={f.label}
              value={form[f.key]}
              options={f.options}
              error={errors[f.key]}
              onChange={(v) => onChange(f.key, v)}
              required={f.required}
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
