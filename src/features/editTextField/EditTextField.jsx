import { useId } from "react";
import { parseNumericInput } from "@/utils/normalize/parseNumericInput";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import s from "./EditTextField.module.scss";

/**
 * Single editable field for LeakDetailsSheet edit mode.
 *
 * Props:
 *  label     – field label
 *  value     – controlled value (string | number)
 *  onChange  – (value) => void
 *  multiline – textarea instead of input
 *  numeric   – enables decimal inputMode + number coercion
 *  compact   – card style (used in params grid and coord pair)
 */
export default function EditTextField({
  label,
  value,
  onChange,
  multiline = false,
  numeric = false,
  compact = false,
}) {
  const id = useId();
  // 0 is a valid numeric value — never coerce with ||
  const display = value ?? "";
  const filled = display !== "" && display !== null;

  const handleChange = (raw) =>
    onChange(numeric ? parseNumericInput(raw) : raw);

  // On blur finalise partial states: "3." → 3, "-" → ""
  const handleBlur = numeric
    ? () => {
        if (value !== "" && value != null) onChange(normalizeNumber(value));
      }
    : undefined;

  const rootClass = [s.field, compact && s.compact].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>

      <div className={s.inputRow}>
        {multiline ? (
          <textarea
            id={id}
            className={s.control}
            value={display}
            onChange={(e) => handleChange(e.target.value)}
            rows={3}
          />
        ) : (
          <input
            id={id}
            className={`${s.control} ${numeric ? s.numeric : ""}`}
            type="text"
            inputMode={numeric ? "decimal" : "text"}
            value={display}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            autoComplete="off"
            spellCheck={false}
          />
        )}

        {filled && (
          <button
            type="button"
            className={s.clear}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            aria-label="Очистить"
          >
            <span className={s.clearInner} aria-hidden>
              ✕
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
