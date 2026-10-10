import { useId, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import { UNITS } from "@/domain/equipmentAcceptance";
import s from "./Repairs.module.scss";

/**
 * Ввод позиции приёмки (7g) и выбор единицы измерения (7h). Справочника МТР
 * нет — наименование пишут руками, поэтому подсказка об этом стоит прямо
 * под полем.
 */
export default function AcceptanceItemSheet({ position, onAdd, onClose }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [ordered, setOrdered] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [complete, setComplete] = useState(true);
  const [dnpnMatch, setDnpnMatch] = useState(true);
  const [remark, setRemark] = useState("");

  const number = (value) => Number(String(value).replace(",", ".")) || 0;
  const left = Math.max(0, number(ordered) - number(qty));
  const valid = name.trim() && number(qty) > 0;

  const toggle = (value, onChange, label) => (
    <div className={s.checkRow}>
      <span>{label}</span>
      <span className={s.yesNo}>
        <button
          type="button"
          aria-pressed={value}
          className={value ? s.yesActive : ""}
          onClick={() => onChange(true)}
        >
          {t("repairs.yes")}
        </button>
        <button
          type="button"
          aria-pressed={!value}
          className={!value ? s.noActive : ""}
          onClick={() => onChange(false)}
        >
          {t("repairs.no")}
        </button>
      </span>
    </div>
  );

  return (
    <div className={s.sheetRoot}>
      <div className={s.backdrop} data-modal-backdrop="" onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={s.sheetHead}>
          <div>
            <p className={s.caption}>
              {t("acceptance.item.caption", { n: position })}
            </p>
            <h2 id={titleId}>{t("acceptance.item.title")}</h2>
          </div>
          <button
            type="button"
            className={s.iconBtn}
            onClick={onClose}
            aria-label={t("repairs.close")}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <label className={s.field}>
          <span>{t("acceptance.item.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <small className={s.hint}>{t("acceptance.item.manual")}</small>
        </label>

        <div className={s.field}>
          <span>{t("acceptance.item.quantity")}</span>
          <div className={s.qtyGroup}>
            <label>
              <small>{t("acceptance.item.received")}</small>
              <input
                inputMode="decimal"
                aria-label={t("acceptance.item.received")}
                value={qty}
                onChange={(event) => setQty(event.target.value)}
              />
            </label>
            <label>
              <small>{t("acceptance.item.ordered")}</small>
              <input
                inputMode="decimal"
                aria-label={t("acceptance.item.ordered")}
                value={ordered}
                placeholder={qty}
                onChange={(event) => setOrdered(event.target.value)}
              />
            </label>
            <div className={s.unitPick}>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={unitsOpen}
                aria-label={t("acceptance.item.unit")}
                onClick={() => setUnitsOpen((value) => !value)}
              >
                {t(`acceptance.units.${unit}.short`)}
                <Icon name="chevronRight" size={14} strokeWidth={2} />
              </button>
              {unitsOpen && (
                <ul role="listbox" className={s.unitList}>
                  {UNITS.map((value) => (
                    <li key={value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={unit === value}
                        className={unit === value ? s.unitActive : ""}
                        onClick={() => {
                          setUnit(value);
                          setUnitsOpen(false);
                        }}
                      >
                        <strong>{t(`acceptance.units.${value}.short`)}</strong>
                        <small>{t(`acceptance.units.${value}.long`)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {left > 0 && (
            <small className={s.warnText}>
              {t("acceptance.item.left", {
                count: left,
                unit: t(`acceptance.units.${unit}.short`),
              })}
            </small>
          )}
        </div>

        <div className={s.field}>
          <span>{t("acceptance.item.check")}</span>
          <div className={s.checkGroup}>
            {toggle(complete, setComplete, t("acceptance.item.complete"))}
            {toggle(dnpnMatch, setDnpnMatch, t("acceptance.item.dnpn"))}
          </div>
        </div>

        <label className={s.field}>
          <span>{t("acceptance.item.remark")}</span>
          <textarea
            className={remark.trim() ? s.remarkFilled : ""}
            value={remark}
            rows={2}
            onChange={(event) => setRemark(event.target.value)}
          />
        </label>

        <div className={s.sheetActions}>
          <button type="button" className={s.secondary} onClick={onClose}>
            {t("acceptance.cancel")}
          </button>
          <button
            type="button"
            className={s.primary}
            disabled={!valid}
            onClick={() =>
              onAdd({
                name,
                unit,
                qty: number(qty),
                ordered: number(ordered) || number(qty),
                complete,
                dnpnMatch,
                remark,
              })
            }
          >
            {t("acceptance.item.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
