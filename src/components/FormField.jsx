import clsx from "clsx";

export default function FormField({
  label,
  error,
  required = false,
  hint,
  className,
  children,
}) {
  return (
    <div
      className={clsx(
        "form-field",
        className,
        error && "error",
        required && "required"
      )}
    >
      {/* основной контрол (input / textarea / select / custom) */}
      {children}

      {/* label (floating) */}
      {label && <label>{label}</label>}

      {/* подсказка */}
      {hint && !error && <div className="field-hint">{hint}</div>}

      {/* ошибка */}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
