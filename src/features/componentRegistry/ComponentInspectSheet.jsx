import { useModalDialog } from "@/hooks/useModalDialog";
import { useLanguage } from "@/app/hooks/useLanguage";
import { component_statuses } from "@/data/component/componentDictionary";
import s from "./ComponentInspectSheet.module.scss";

/**
 * What the hardware was found doing, recorded against the moment of looking.
 *
 * The date is not offered. An inspection happened when it happened, and a field
 * for it would only collect the day somebody got round to the paperwork. Every
 * choice here — including "unchanged" — stamps the visit, because "looked at
 * it, still fine" is the evidence that the walk covered this component at all.
 */
export default function ComponentInspectSheet({
  component = null,
  // Осмотр списком спрашивает то же самое, но не про одну карточку: вместо
  // номера и наименования в подзаголовке стоит, сколько их выбрано.
  subtitle = null,
  onPick,
  onClose,
}) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog({ open: true, onClose });

  const current = String(component?.component_status ?? "").trim();

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("components.inspectTitle")}
        tabIndex={-1}
      >
        <header className={s.head}>
          <h2>{t("components.inspectTitle")}</h2>
          <p>
            {subtitle ??
              `${component?.component_uid} · ${
                component?.component || t("components.unnamed")
              }`}
          </p>
        </header>

        <ul className={s.list}>
          {component_statuses.map((status) => (
            <li key={status}>
              <button
                type="button"
                className={status === current ? s.optionActive : s.option}
                onClick={() => onPick(status)}
              >
                {status}
                {status === current && (
                  <span className={s.badge}>{t("components.statusNow")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <footer className={s.foot}>
          <button type="button" onClick={onClose}>
            {t("components.cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}
