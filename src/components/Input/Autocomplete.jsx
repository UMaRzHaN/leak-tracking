import { useState, useRef, useEffect, useMemo } from "react";
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
  onComplete,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const inputRef = useRef(null);

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

  const showClear = query?.length > 0;

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);

    // 🔑 единый сигнал "ввод завершён"
    onComplete?.(inputRef.current);
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className={[s.formField, required && s.isRequired, error && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      <label htmlFor={id} className={s.formLabel}>
        {label}
        {required && <span className={s.required}> *</span>}
      </label>

      <div className={s.inputWrapper}>
        <input
          data-enter-nav
          ref={inputRef}
          id={id}
          className={s.formInput}
          type="text"
          value={query}
          placeholder={placeholder || " "}
          enterKeyHint="next"
          inputMode="text"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            requestAnimationFrame(() => {
              if (
                !document.activeElement?.closest(
                  `.${s.autocompleteList}`,
                )
              ) {
                setOpen(false);
              }
            });
          }}
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
            tabIndex={-1}          // ⛔ не участвует в Enter-навигации
            aria-label="Очистить"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
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
