import FormField from "./FormField";

export default function TextInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  error,
  emojis,
  ...props
}) {
  return (
    <FormField
      label={label}
      error={error}
      required={props.required}
      className={props.className}
      hint={props.hint}
    >
      <input
        id={id}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value, e)}
        placeholder=" "
        {...props}
      />
    </FormField>
  );
}
