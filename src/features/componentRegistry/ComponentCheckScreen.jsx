import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import GpsCoordsUpdate from "@/features/coords/GpsCoordsUpdate";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import Icon from "@/components/ui/Icon/Icon";
import { component_statuses } from "@/data/component/componentDictionary";
import s from "@/pages/Monitoring/Monitoring.module.scss";

/**
 * Осмотр компонента на весь экран — как проверка утечки в обходе
 * мониторинга: шапка и кнопка закреплены, между ними состояние, точка по
 * GPS, замечание и снимок. Снимок обязателен, если так решено в настройках
 * проекта: «посмотрел, всё на месте» без кадра в споре ничего не доказывает.
 *
 * @param {{
 *   component: any,
 *   photoRequired?: boolean,
 *   saving?: boolean,
 *   onSave: (draft: { status: string, comment: string, photo: any, coords: any }) => void|Promise<void>,
 *   onClose: () => void,
 * }} props
 */
export default function ComponentCheckScreen({
  component,
  photoRequired = true,
  saving = false,
  onSave,
  onClose,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose, closeDisabled: saving });
  const current = String(component?.component_status ?? "").trim();
  const [draft, setDraft] = useState(() => ({
    status: current || component_statuses[0],
    comment: "",
    photo: /** @type {any} */ (null),
    coords: /** @type {any} */ (null),
  }));
  const [submitted, setSubmitted] = useState(false);
  const change = (patch) => setDraft((value) => ({ ...value, ...patch }));
  // Своё состояние, вписанное в карточку руками, тоже в списке — иначе
  // осмотр молча заменил бы его первым из словаря.
  const statuses =
    current && !component_statuses.includes(current)
      ? [current, ...component_statuses]
      : component_statuses;

  const submit = () => {
    setSubmitted(true);
    if (photoRequired && !draft.photo?.raw) return;
    onSave(draft);
  };

  return (
    <div
      ref={dialogRef}
      className={s.checkScreen}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={s.checkHeader}>
        <button
          type="button"
          className={s.checkClose}
          onClick={onClose}
          disabled={saving}
          aria-label={t("components.check.close")}
        >
          <Icon name="close" size={20} strokeWidth={2} />
        </button>
        <div className={s.checkTitleBlock}>
          <h2 id={titleId}>{t("components.check.title")}</h2>
          <p>
            {`№ ${component?.component_uid ?? "—"} · ${
              component?.component || t("components.unnamed")
            }`}
          </p>
        </div>
      </header>

      <div className={s.checkBody}>
        <label className={s.field}>
          <span>{t("components.check.state")}</span>
          <select
            value={draft.status}
            onChange={(event) => change({ status: event.target.value })}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === current
                  ? `${status} (${t("components.statusNow")})`
                  : status}
              </option>
            ))}
          </select>
        </label>

        {/* Точка записана не там — поправить по месту, где стоит обходчик. */}
        <GpsCoordsUpdate
          current={component}
          applied={draft.coords}
          onApply={(coords) => change({ coords })}
        />

        <label className={s.field}>
          <span>{t("components.check.comment")}</span>
          <textarea
            value={draft.comment}
            onChange={(event) => change({ comment: event.target.value })}
            placeholder={t("components.check.commentPlaceholder")}
            rows={3}
          />
        </label>

        <PhotoInput
          value={draft.photo}
          onChange={(photo) => change({ photo })}
          label={t("components.check.photo")}
          required={photoRequired}
          compact
          error={photoRequired && submitted && !draft.photo?.raw}
        />
      </div>

      <footer className={s.checkFooter}>
        <button
          type="button"
          className={s.saveBtn}
          onClick={submit}
          disabled={saving}
        >
          {saving ? t("components.check.saving") : t("components.check.save")}
        </button>
      </footer>
    </div>
  );
}
