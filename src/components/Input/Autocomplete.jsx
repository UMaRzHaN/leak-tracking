import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import s from "./Input.module.scss";

export default function Autocomplete({
  id,
  label,
  value,
  options = [],
  onChange,
  error,
  placeholder = "",
  required = false,
  onEnter, // 👈 ожидает DOM-элемент
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const inputRef = useRef(null);

  const showClear = query.length > 0;

  // 🔹 sync с внешним value
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  const filtered = useMemo(
    () =>
      options.filter((o) =>
        o.toLowerCase().includes(query.toLowerCase()),
      ),
    [options, query],
  );

  const select = useCallback(
    (val) => {
      setQuery(val);
      onChange(val);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const clear = useCallback(() => {
    setQuery("");
    onChange("");
    setOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== "Enter") return;

      // 🔹 если есть подсказки — выбираем первую
      if (open && filtered.length > 0) {
        e.preventDefault();
        select(filtered[0]);
        return;
      }

      // 🔹 обычный Enter (как InputCard)
      e.preventDefault();
      inputRef.current?.blur();
      onEnter?.(inputRef.current);
    },
    [open, filtered, select, onEnter],
  );

  return (
    <div
      className={[s.formField, required && s.isRequired, error && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label htmlFor={id} className={s.formLabel}>
          {label}
          {required && <span className={s.required}> *</span>}
        </label>
      )}

      <div className={s.inputWrapper}>
        <input
          ref={inputRef}
          id={id}
          className={s.formInput}
          type="text"
          value={query}
          placeholder={placeholder || " "}
          required={required}
          aria-required={required}
          aria-invalid={!!error}
          enterKeyHint="next"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onChange(v);
            setOpen(true);
          }}
        />

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className={s.autocompleteList}>
          {filtered.map((opt, i) => (
            <li
              key={i}
              className={s.autocompleteItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(opt)}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}

      {error && <div className={s.formError}>{error}</div>}
    </div>
  );
}
