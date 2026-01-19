import { useId } from "react";
import s from "./EditTextField.module.scss";

export default function EditTextField({
  label,
  value,
  onChange,
  multiline,
  type = "search",
}) {
  const id = useId();
  const showClear = multiline && value;

  return (
    <div className={`${s.field} ${value ? s.hasValue : ""}`}>
      {multiline ? (
        <div className={s.textareaWrapper}>
          <textarea
            id={id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />

          {showClear && (
            <button
              type="button"
              className={s.clearBtn}
              onClick={() => onChange("")}
              aria-label="Очистить"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <input
          id={id}
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
        />
      )}

      <label htmlFor={id}>{label}</label>
    </div>
  );
}
