import { useState, useMemo, useEffect, useId } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import { fieldLabel } from "@/utils/fieldLabels";
import s from "./VoicePreviewSheet.module.scss";

/**
 * @param {{
 *   pending: any,
 *   heard?: {phrase: string, fields: Record<string, string>} | null,
 *   steps: any,
 *   onConfirm: (data: any) => void,
 *   onDismiss: () => void,
 * }} props
 */
export default function VoicePreviewSheet({
  pending,
  heard = null,
  steps,
  onConfirm,
  onDismiss,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({
    open: Boolean(pending),
    onClose: onDismiss,
  });

  const labelMap = useMemo(() => {
    const map = {};
    steps?.forEach((step) =>
      step.fields?.forEach((field) => {
        map[field.key] = fieldLabel(field.key, t, field.label);
      }),
    );
    return map;
  }, [steps, t]);

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
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.handle} />
        <p id={titleId} className={s.title}>
          {t("voice.preview.title", {
            defaultValue: "Recognized by voice",
          })}{" "}
          🎤
        </p>

        {heard?.phrase ? (
          <p className={s.phrase}>
            {t("voice.preview.heard", {
              defaultValue: "Heard",
            })}
            : «{heard.phrase}»
          </p>
        ) : null}

        {entries.length === 0 ? (
          <p className={s.empty}>
            {t("voice.preview.empty", {
              defaultValue: "Nothing was recognized",
            })}
          </p>
        ) : (
          <div className={s.list}>
            {entries.map(([key, value]) => {
              const label = labelMap[key] ?? fieldLabel(key, t);
              // Словарь заменил сказанное — рядом показываем, что было
              // сказано: «не работает», ставшее «В работе», иначе не заметить.
              const said = heard?.fields?.[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`${s.row} ${selected.has(key) ? s.checked : ""}`}
                  aria-label={`${label} ${String(value)}`}
                  aria-pressed={selected.has(key)}
                  onClick={() => toggle(key)}
                >
                  <span className={s.check}>
                    {selected.has(key) ? "✓" : ""}
                  </span>
                  <span className={s.fieldLabel}>{label}</span>
                  <span className={s.value}>
                    {String(value)}
                    {said ? (
                      <span className={s.said}>
                        {t("voice.preview.heard", { defaultValue: "Heard" })}: «
                        {said}»
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
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
