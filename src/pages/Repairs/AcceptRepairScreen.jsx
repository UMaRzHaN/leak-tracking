import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import GpsCoordsUpdate from "@/features/coords/GpsCoordsUpdate";
import Icon from "@/components/ui/Icon/Icon";
import { getRepairBrigade } from "@/domain/repairStages";
import { REPAIR_CHECK_OUTCOME, repairCheckOutcome } from "@/domain/repairCheck";
import { getLastMonitoringFlag } from "@/utils/monitoring";
import { STATUS } from "@/utils/status";
import { repairCheckTexts } from "./repairCheckTexts";
import s from "./Repairs.module.scss";

export const MTR_SOURCE = Object.freeze({
  ACCEPTANCE: "acceptance",
  CUSTOMER: "customer",
});

/**
 * Проверка ремонта на весь экран (7c). Ответы решают, куда уходит запись
 * (`repairCheckOutcome`): утечки нет — ремонт закрыт, нужен снимок после
 * работ; утечка есть и ремонт выполнен — «в ремонте»; ремонт не выполнен —
 * «ожидает МТР».
 *
 * МТР по факту — из принятых по накладным позиций («Приёмка») или от
 * заказчика (два поля ввода).
 *
 * @param {{
 *   leak: any,
 *   items?: Array<{ id: string, name: string, unit: string, invoice: string, available: number }>,
 *   saving?: boolean,
 *   progress?: { index: number, total: number }|null,
 *   photoRequired?: boolean,
 *   onSave: (draft: { leaking: boolean, done: boolean, photo_after?: string, materials_equipment?: string, note?: string, brigade?: string, physicalTag?: boolean, coords?: { lat: number, lng: number, accuracy?: number } }) => Promise<boolean|void>|boolean|void,
 *   onClose: () => void,
 * }} props
 */
export default function AcceptRepairScreen({
  leak,
  items = [],
  saving = false,
  progress = null,
  photoRequired = true,
  onSave,
  onClose,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose, closeDisabled: saving });
  const { savePhoto } = usePhotoStorage();
  const [done, setDone] = useState(true);
  const [stillLeaking, setStillLeaking] = useState(false);
  // Как в обходе: по умолчанию — последний известный ответ, иначе «есть».
  const [physicalTag, setPhysicalTag] = useState(
    () => getLastMonitoringFlag(leak, "physicalTag") ?? true,
  );
  const [brigade, setBrigade] = useState(() => getRepairBrigade(leak) ?? "");
  const [source, setSource] = useState(
    /** @type {string} */ (
      items.length ? MTR_SOURCE.ACCEPTANCE : MTR_SOURCE.CUSTOMER
    ),
  );
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerQty, setCustomerQty] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(/** @type {any} */ (null));
  const [coords, setCoords] = useState(
    /** @type {{ lat: number, lng: number, accuracy?: number }|null} */ (null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const outcome = repairCheckOutcome({ leaking: stillLeaking, done });
  const accepting = outcome === REPAIR_CHECK_OUTCOME.RESOLVED;
  const recheck = leak?.status === STATUS.RESOLVED;
  const texts = repairCheckTexts(outcome, recheck);
  // Снимок нужен, только когда ремонт закрывается, и если настройки проекта
  // его требуют. Закрытый ремонт уже снят при приёмке.
  const photoNeeded = accepting && photoRequired && !recheck;
  const item = items.find((candidate) => candidate.id === itemId) ?? null;
  const locked = saving || busy;
  const unitShort = (unit) => t(`acceptance.units.${unit}.short`);
  const materials = () => {
    if (source === MTR_SOURCE.ACCEPTANCE && item) {
      return `${item.name} × ${qty} ${unitShort(item.unit)} (${item.invoice})`;
    }
    if (source === MTR_SOURCE.CUSTOMER && customerName.trim()) {
      const amount = customerQty.trim() ? ` × ${customerQty.trim()}` : "";
      return `${t("repairs.accept.customerPrefix")}: ${customerName.trim()}${amount}`;
    }
    return undefined;
  };

  const submit = async () => {
    setSubmitted(true);
    const answers = {
      leaking: stillLeaking,
      done,
      note: note.trim() || undefined,
      brigade: brigade.trim() || undefined,
      physicalTag,
      ...(coords ? { coords } : {}),
    };
    // Без обязательного снимка он по желанию и вместе с МТР ложится в
    // отметку стадии.
    if (photoNeeded && !photo?.raw) return;
    setBusy(true);
    try {
      let photoPath;
      if (photo?.raw) {
        const saved = await savePhoto(photo.raw, `${leak.id}_after`, [], {
          cleanupOldVersions: false,
        });
        photoPath = typeof saved === "string" ? saved : saved?.path;
        if (!photoPath) {
          throw new Error("Photo storage did not return a saved path");
        }
      }
      await onSave({
        ...answers,
        ...(photoPath ? { photo_after: photoPath } : {}),
        materials_equipment: materials(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className={`${s.screen} ${s.checkScreen}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={s.screenHeader}>
        <button
          type="button"
          className={s.screenClose}
          onClick={onClose}
          disabled={locked}
          aria-label={t("repairs.close")}
        >
          <Icon name="close" size={20} strokeWidth={2} />
        </button>
        <div className={s.screenTitle}>
          <h2 id={titleId}>{t("repairs.accept.title")}</h2>
          <p>
            {t("cards.tagPrefix")}
            {leak.leak_id ?? "—"}
            {progress &&
              ` · ${t("repairs.accept.progress", {
                index: progress.index,
                total: progress.total,
              })}`}
          </p>
        </div>
      </header>

      <div className={s.screenBody}>
        {/* Три вопроса — одной строкой, с короткими подписями. */}
        <div className={s.row3}>
          {[
            [done, setDone, "repairs.accept.done", "repairs.accept.doneShort"],
            [
              stillLeaking,
              setStillLeaking,
              "repairs.accept.leaking",
              "repairs.accept.leakingShort",
            ],
            [
              physicalTag,
              setPhysicalTag,
              "monitoring.physicalTag",
              "repairs.accept.physicalTagShort",
            ],
          ].map(([value, onChange, question, label]) => (
            <label key={String(label)} className={s.field}>
              {/* На виду — короткая подпись, полный вопрос — имя поля. */}
              <span>{t(String(label))}</span>
              <select
                aria-label={t(String(question))}
                value={value ? "yes" : "no"}
                onChange={(event) =>
                  /** @type {(next: boolean) => void} */ (onChange)(
                    event.target.value === "yes",
                  )
                }
              >
                <option value="yes">{t("repairs.yes")}</option>
                <option value="no">{t("repairs.no")}</option>
              </select>
            </label>
          ))}
        </div>
        <p className={s.hint} aria-live="polite">
          {t(texts.result)}
        </p>

        <label className={s.field}>
          <span>{t("repairs.brigade")}</span>
          <input
            value={brigade}
            onChange={(event) => setBrigade(event.target.value)}
            placeholder={t("repairs.brigadePlaceholder")}
          />
        </label>

        <div className={s.field}>
          <span>{t("repairs.accept.mtr")}</span>
          <div className={s.segment} role="radiogroup">
            {[
              [MTR_SOURCE.ACCEPTANCE, t("repairs.accept.fromAcceptance")],
              [MTR_SOURCE.CUSTOMER, t("repairs.accept.fromCustomer")],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                className={source === value ? s.segmentActive : ""}
                onClick={() => setSource(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {source === MTR_SOURCE.ACCEPTANCE ? (
            items.length ? (
              <>
                <div className={s.mtrRow}>
                  <select
                    aria-label={t("repairs.accept.item")}
                    value={itemId}
                    onChange={(event) => {
                      setItemId(event.target.value);
                      setQty(1);
                    }}
                  >
                    {items.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} · {option.invoice}
                      </option>
                    ))}
                  </select>
                  <div className={s.stepper}>
                    <button
                      type="button"
                      aria-label={t("repairs.accept.less")}
                      onClick={() => setQty((value) => Math.max(1, value - 1))}
                    >
                      −
                    </button>
                    <span>
                      {qty} {item && unitShort(item.unit)}
                    </span>
                    <button
                      type="button"
                      aria-label={t("repairs.accept.more")}
                      onClick={() =>
                        setQty((value) =>
                          Math.min(item?.available ?? value, value + 1),
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className={s.hint}>{t("repairs.accept.acceptanceHint")}</p>
              </>
            ) : (
              <p className={s.hint}>{t("repairs.accept.noAccepted")}</p>
            )
          ) : (
            <div className={s.mtrRow}>
              <input
                aria-label={t("repairs.accept.customerName")}
                placeholder={t("repairs.accept.customerName")}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
              <input
                className={s.qtyInput}
                aria-label={t("repairs.accept.customerQty")}
                placeholder={t("repairs.accept.customerQty")}
                inputMode="decimal"
                value={customerQty}
                onChange={(event) =>
                  setCustomerQty(event.target.value.replace(/[^0-9.,]/g, ""))
                }
              />
            </div>
          )}
        </div>

        {/* Точка записана не там — поправить по месту, где стоит проверяющий. */}
        <GpsCoordsUpdate current={leak} applied={coords} onApply={setCoords} />

        <label className={s.field}>
          <span>{t("repairs.comment")}</span>
          <textarea
            value={note}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("repairs.accept.notePlaceholder")}
          />
        </label>

        <PhotoInput
          value={photo}
          onChange={setPhoto}
          label={t("repairs.accept.photo")}
          required={photoNeeded}
          compact
          error={photoNeeded && submitted && !photo?.raw}
        />
      </div>

      <footer className={s.screenFooter}>
        <button
          type="button"
          className={s.primary}
          disabled={locked}
          onClick={submit}
        >
          {t(texts.submit)}
        </button>
      </footer>
    </div>
  );
}
