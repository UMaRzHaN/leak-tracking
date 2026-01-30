import { useId } from "react";
import s from "./EditTextField.module.scss";

export default function EditTextField({
  label,
  value,
  onChange,
  multiline,
  type = "text",
}) {
  const id = useId();
  const showClear = value?.length > 0;

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
        <div className={s.inputWrapper}>
          <input
            id={id}
            type={type}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder=" "
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
      )}

      <label htmlFor={id}>{label}</label>
    </div>
  );
}
