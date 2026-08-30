import { useState, useRef, useEffect, useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { smartFilter } from "./smartFilter";
import s from "./Autocomplete.module.scss";

function optionValue(option) {
  return typeof option === "string" ? option : (option?.value ?? "");
}

function optionLabel(option) {
  return typeof option === "string"
    ? option
    : (option?.label ?? option?.value ?? "");
}

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
  hint,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));

  useEffect(() => {
    if (!value) {
      setQuery("");
      return;
    }

    const exact = options.find((option) => optionValue(option) === value);
    setQuery(exact ? optionLabel(exact) : value);
  }, [options, value]);

  const filtered = useMemo(() => smartFilter(query, options), [options, query]);
  const showClear = query?.length > 0;

  const select = (selectedOption) => {
    const selectedValue = optionValue(selectedOption);
    const selectedLabel = optionLabel(selectedOption);

    setQuery(selectedLabel);
    onChange(selectedValue);
    onComplete?.(selectedValue);
    setOpen(false);
    inputRef.current?.focus();
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
              if (!document.activeElement?.closest(`.${s.autocompleteList}`)) {
                setOpen(false);
              }
            });
          }}
          onChange={(e) => {
            const nextValue = e.target.value;
            setQuery(nextValue);
            onChange(nextValue);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Escape снимает подсказки — но только их. Карточку компонента и
            // утечку заполняют внутри листа, который сам закрывается по Escape
            // (`useModalDialog` слушает на document), поэтому пока список
            // открыт, событие дальше не идёт: иначе попытка убрать подсказку
            // уносила бы всё набранное вместе с листом.
            //
            // Список закрыт — Escape свободно уходит наверх и закрывает лист,
            // как и ожидается.
            if (!open || filtered.length === 0) return;
            e.stopPropagation();
            setOpen(false);
          }}
        />

        {showClear && (
          <button
            type="button"
            className={s.clearBtn}
            tabIndex={-1}
            aria-label={t("common.clear")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className={s.autocompleteList}>
          {filtered.map((option, index) => (
            <li
              key={`${optionValue(option)}-${index}`}
              className={s.autocompleteItem}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
            >
              {optionLabel(option)}
            </li>
          ))}
        </ul>
      )}

      {hint && !error && <p className={s.hint}>{hint}</p>}
      {error && <div className={s.formError}>{error}</div>}
    </div>
  );
}
