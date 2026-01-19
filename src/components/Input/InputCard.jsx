export default function InputCard({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  as = "input", // 🔥 input | textarea
  error,
  required = false,
  rightSlot,
  rows = 3, // для textarea
}) {
  const isTextarea = as === "textarea";

  return (
    <div
      className={["input-card", required && "is-required", error && "has-error"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="input-card-header">
        <label className="input-card-label">
          {label}
          {required && <span className="required">*</span>}
        </label>

        {rightSlot && <div className="input-card-slot">{rightSlot}</div>}
      </div>

      {isTextarea ? (
        <textarea
          className="input-card-textarea"
          rows={rows}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input-card-input"
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          inputMode={type === "number" ? "decimal" : undefined}
        />
      )}

      {error && <div className="input-card-error">{error}</div>}
    </div>
  );
}
