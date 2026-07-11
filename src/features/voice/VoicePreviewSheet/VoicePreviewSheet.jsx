import { useState, useMemo, useEffect } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./VoicePreviewSheet.module.scss";

const VOICE_KEY_LABELS = {
  leak_cause: {
    ru: "Причина утечки",
    en: "Leak cause",
  },
  category: {
    ru: "Категория",
    en: "Category",
  },
};

function getFieldLabel(key, fallbackLabel, lang, t) {
  return t(`addLeak.fields.${key}.label`, {
    defaultValue: VOICE_KEY_LABELS[key]?.[lang] ?? fallbackLabel ?? key,
  });
}

export default function VoicePreviewSheet({
  pending,
  steps,
  onConfirm,
  onDismiss,
}) {
  const { lang, t } = useLanguage();

  const labelMap = useMemo(() => {
    const map = {};
    steps?.forEach((step) =>
      step.fields?.forEach((field) => {
        map[field.key] = getFieldLabel(field.key, field.label, lang, t);
      }),
    );
    return map;
  }, [lang, steps, t]);

  const entries = useMemo(
    () =>
      Object.entries(pending ?? {}).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    [pending],
  );

  const [selected, setSelected] = useState(
    () => new Set(entries.map(([key]) => key)),
  );

  useEffect(() => {
    setSelected(new Set(entries.map(([key]) => key)));
  }, [entries]);

  if (!pending) return null;

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const confirmed = {};
    entries.forEach(([key, value]) => {
      if (selected.has(key)) confirmed[key] = value;
    });
    onConfirm(confirmed);
  };

  return (
    <div className={s.overlay} onClick={onDismiss}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <p className={s.title}>
          {t("voice.preview.title", {
            defaultValue: "Recognized by voice",
          })}{" "}
          🎤
        </p>

        {entries.length === 0 ? (
          <p className={s.empty}>
            {t("voice.preview.empty", {
              defaultValue: "Nothing was recognized",
            })}
          </p>
        ) : (
          <div className={s.list}>
            {entries.map(([key, value]) => (
              <button
                key={key}
                type="button"
                className={`${s.row} ${selected.has(key) ? s.checked : ""}`}
                onClick={() => toggle(key)}
              >
                <span className={s.check}>{selected.has(key) ? "✓" : ""}</span>
                <span className={s.fieldLabel}>
                  {labelMap[key] ?? getFieldLabel(key, null, lang, t)}
                </span>
                <span className={s.value}>{String(value)}</span>
              </button>
            ))}
          </div>
        )}

        <div className={s.actions}>
          <button className={s.cancel} type="button" onClick={onDismiss}>
            {t("voice.preview.cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            className={s.confirm}
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            {t("voice.preview.apply", { defaultValue: "Apply" })} (
            {selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
