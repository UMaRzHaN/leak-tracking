import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./SearchFieldSelect.module.scss";

export default function SearchFieldSelect({
  value,
  onChange,
  options = [],
  placeholder,
}) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fallbackPlaceholder =
    placeholder || (lang === "ru" ? "Выберите поле" : "Select field");

  const currentLabel =
    options.find((option) => option.key === value)?.label ||
    fallbackPlaceholder;

  useEffect(() => {
    if (!open) return;

    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <div className={s.dropdown} ref={ref}>
      <button
        type="button"
        className={s.button}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={s.label}>{currentLabel}</span>
        <span className={s.arrow}>▾</span>
      </button>

      {open && (
        <div className={s.menu}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${s.option} ${option.key === value ? s.active : ""}`}
              onClick={() => {
                onChange(option.key);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
