import { useMemo, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
import s from "./ComponentDetailsSheet.module.scss";

/**
 * The card in full: the photograph, everything that was filled in, and the
 * trail of who did what to it.
 *
 * Reading is the default. A registry is written once during the walk and read
 * for years afterwards, so opening a card lands on what it says rather than on
 * a form — and the destructive action lives here, behind that reading, instead
 * of one mis-tap away in the list.
 */
export default function ComponentDetailsSheet({
  component,
  fields = [],
  onEdit,
  onRemove,
  onClose,
}) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog({ open: true, onClose });
  const photoSrc = usePhotoSrc(component?.photo ?? null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  /** Only what was actually answered — empty rows say nothing worth the space. */
  const filled = useMemo(
    () =>
      fields
        .filter((field) => field.viewable)
        .map((field) => ({ ...field, value: component?.[field.key] }))
        .filter(({ value }) => value != null && String(value).trim() !== ""),
    [component, fields],
  );

  const history = [...(component?.history ?? [])].reverse();

  const actionLabel = (action) =>
    ({
      [COMPONENT_HISTORY_ACTIONS.CREATED]: t("components.historyCreated"),
      [COMPONENT_HISTORY_ACTIONS.EDITED]: t("components.historyEdited"),
      [COMPONENT_HISTORY_ACTIONS.INSPECTED]: t("components.historyInspected"),
    })[action] ?? action;

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("components.detailsTitle")}
        tabIndex={-1}
      >
        <header className={s.head}>
          <span className={s.uid}>{component?.component_uid || "—"}</span>
          <span className={s.title}>
            {component?.component || t("components.unnamed")}
          </span>
          <button type="button" className={s.close} onClick={onClose}>
            {t("components.close")}
          </button>
        </header>

        <div className={s.body}>
          {photoSrc ? (
            <img className={s.photo} src={photoSrc} alt="" />
          ) : (
            <p className={s.noPhoto}>{t("components.noPhoto")}</p>
          )}

          <dl className={s.fields}>
            {filled.map(({ key, label, value }) => (
              <div key={key} className={s.fieldRow}>
                <dt>{label}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>

          <section className={s.history}>
            <h3>{t("components.historyTitle")}</h3>
            {history.length === 0 ? (
              <p className={s.muted}>{t("components.historyEmpty")}</p>
            ) : (
              <ul>
                {history.map((entry, index) => (
                  <li key={`${entry.date}-${index}`}>
                    <span className={s.historyAction}>
                      {actionLabel(entry.action)}
                      {entry.to ? ` · ${entry.to}` : ""}
                    </span>
                    <span className={s.historyMeta}>
                      {new Date(entry.date).toLocaleString()} · {entry.user}
                    </span>
                    {Array.isArray(entry.changes) &&
                      entry.changes.length > 0 && (
                        <span className={s.historyChanges}>
                          {entry.changes.map((change) => change.key).join(", ")}
                        </span>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className={s.foot}>
          {confirmingRemove ? (
            <>
              <button type="button" onClick={() => setConfirmingRemove(false)}>
                {t("components.cancel")}
              </button>
              <button
                type="button"
                className={s.danger}
                onClick={() => onRemove?.(component)}
              >
                {t("components.removeConfirm")}
              </button>
            </>
          ) : (
            <>
              {/* Deliberately behind the reading rather than in the list, where
                  a mis-tap costs a card somebody walked out to write. */}
              <button
                type="button"
                className={s.remove}
                onClick={() => setConfirmingRemove(true)}
              >
                {t("components.remove")}
              </button>
              <button
                type="button"
                className={s.primary}
                onClick={() => onEdit?.(component)}
              >
                {t("components.edit")}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
