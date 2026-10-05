import { lazy, Suspense, useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import {
  addBatch,
  createInvoice,
  receivedByItem,
} from "@/domain/equipmentAcceptance";
import s from "./Repairs.module.scss";

const AcceptanceItemSheet = lazy(() => import("./AcceptanceItemSheet"));

const num = (value) => Number(String(value ?? "").replace(",", ".")) || 0;

/**
 * Новая приёмка или очередная партия по накладной (7e). Строка позиции:
 * сколько пришло из заказанного, «Комплектно» и «Dn/Pn совпадают» тапом, и
 * замечание, если что-то не так. Позиции вне накладной добавляются листом
 * ввода (7g).
 */
export default function AcceptanceScreen({
  invoice = null,
  user,
  onSave,
  onClose,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  const [number, setNumber] = useState(invoice?.number ?? "");
  const [supplier, setSupplier] = useState(invoice?.supplier ?? "");
  const [warehouse, setWarehouse] = useState(invoice?.warehouse ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lines, setLines] = useState(() => {
    if (!invoice) return [];
    const received = receivedByItem(invoice);
    return invoice.items
      .map((item) => {
        const left = Math.max(
          0,
          num(item.ordered) - (received.get(item.id) ?? 0),
        );
        return {
          key: item.id,
          itemId: item.id,
          name: item.name,
          unit: item.unit,
          ordered: left,
          qty: left,
          complete: true,
          dnpnMatch: true,
          remark: "",
          remarkOpen: false,
        };
      })
      .filter((line) => line.ordered > 0);
  });

  const batchNumber = (invoice?.batches?.length ?? 0) + 1;
  const totals = useMemo(
    () => ({
      qty: lines.reduce((sum, line) => sum + num(line.qty), 0),
      ordered: lines.reduce((sum, line) => sum + num(line.ordered), 0),
    }),
    [lines],
  );
  const valid =
    (invoice || number.trim()) && lines.some((line) => num(line.qty) > 0);

  const patch = (key, change) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );

  const save = () => {
    // Служебные поля строки (ключ списка, раскрыто ли замечание) в накладную
    // не идут.
    const payload = lines.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      unit: line.unit,
      ordered: line.ordered,
      qty: line.qty,
      complete: line.complete,
      dnpnMatch: line.dnpnMatch,
      remark: line.remark,
    }));
    onSave(
      invoice
        ? addBatch(invoice, payload, { user })
        : createInvoice({ number, supplier, warehouse, lines: payload, user }),
    );
  };

  const unitShort = (unit) => t(`acceptance.units.${unit}.short`);

  return (
    <div
      ref={dialogRef}
      className={s.screen}
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
          aria-label={t("repairs.close")}
        >
          <Icon name="close" size={20} strokeWidth={2} />
        </button>
        <div className={s.screenTitle}>
          <p className={s.caption}>
            {invoice ? invoice.number : t("acceptance.new.caption")}
          </p>
          <h2 id={titleId}>{t("acceptance.title")}</h2>
        </div>
      </header>

      <div className={s.screenBody}>
        {!invoice && (
          <div className={s.field}>
            <span>{t("acceptance.new.delivery")}</span>
            <div className={s.formCard}>
              {[
                [t("acceptance.new.number"), number, setNumber],
                [t("acceptance.new.supplier"), supplier, setSupplier],
                [t("acceptance.new.warehouse"), warehouse, setWarehouse],
              ].map(([label, value, onChange]) => (
                <label key={String(label)} className={s.formRow}>
                  <span>{label}</span>
                  <input
                    value={String(value)}
                    onChange={(event) =>
                      /** @type {(v: string) => void} */ (onChange)(
                        event.target.value,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={s.field}>
          <span className={s.fieldHeadRow}>
            {t("acceptance.new.items")}
            <em>
              {t("acceptance.new.batch", {
                n: batchNumber,
                count: lines.length,
              })}
            </em>
          </span>
          <div className={s.formCard}>
            {lines.map((line) => {
              const short = num(line.qty) < num(line.ordered);
              return (
                <div key={line.key} className={s.lineRow}>
                  <div className={s.lineHead}>
                    <strong>{line.name}</strong>
                    <input
                      className={short ? s.qtyShort : ""}
                      inputMode="decimal"
                      aria-label={t("acceptance.item.received")}
                      value={String(line.qty)}
                      onChange={(event) =>
                        patch(line.key, { qty: event.target.value })
                      }
                    />
                    <small>
                      / {line.ordered} {unitShort(line.unit)}
                    </small>
                  </div>
                  <div className={s.lineChips}>
                    {short && (
                      <span className={s.chipWarn}>
                        {t("acceptance.new.left", {
                          count: num(line.ordered) - num(line.qty),
                          unit: unitShort(line.unit),
                        })}
                      </span>
                    )}
                    <button
                      type="button"
                      className={line.complete ? s.chipOk : s.chipWarn}
                      aria-pressed={line.complete}
                      onClick={() =>
                        patch(line.key, { complete: !line.complete })
                      }
                    >
                      {line.complete
                        ? t("acceptance.new.complete")
                        : t("acceptance.new.incomplete")}
                    </button>
                    <button
                      type="button"
                      className={line.dnpnMatch ? s.chipOk : s.chipWarn}
                      aria-pressed={line.dnpnMatch}
                      onClick={() =>
                        patch(line.key, { dnpnMatch: !line.dnpnMatch })
                      }
                    >
                      {line.dnpnMatch
                        ? t("acceptance.new.dnpnOk")
                        : t("acceptance.new.dnpnBad")}
                    </button>
                    {!line.remarkOpen && !line.remark && (
                      <button
                        type="button"
                        className={s.linkBtn}
                        onClick={() => patch(line.key, { remarkOpen: true })}
                      >
                        + {t("acceptance.new.remark")}
                      </button>
                    )}
                  </div>
                  {(line.remarkOpen || line.remark) && (
                    <input
                      className={s.remarkInput}
                      aria-label={t("acceptance.new.remark")}
                      value={line.remark}
                      onChange={(event) =>
                        patch(line.key, { remark: event.target.value })
                      }
                    />
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className={s.addLine}
              onClick={() => setSheetOpen(true)}
            >
              <Icon name="plus" size={20} strokeWidth={2} />
              <span>
                <strong>{t("acceptance.new.addItem")}</strong>
                <small>{t("acceptance.new.addItemHint")}</small>
              </span>
            </button>
          </div>
        </div>
      </div>

      <footer className={s.screenFooter}>
        {lines.length > 0 && (
          <p className={totals.qty < totals.ordered ? s.warnText : s.hint}>
            {t("acceptance.new.summary", {
              n: batchNumber,
              qty: totals.qty,
              ordered: totals.ordered,
            })}
            {totals.qty < totals.ordered &&
              ` · ${t("acceptance.new.restExpected")}`}
          </p>
        )}
        <button
          type="button"
          className={s.primary}
          disabled={!valid}
          onClick={save}
        >
          {t("acceptance.new.save")}
        </button>
      </footer>

      {sheetOpen && (
        <Suspense fallback={null}>
          <AcceptanceItemSheet
            position={lines.length + 1}
            onClose={() => setSheetOpen(false)}
            onAdd={(line) => {
              setLines((current) => [
                ...current,
                {
                  ...line,
                  key: `new-${current.length}-${line.name}`,
                  remarkOpen: false,
                },
              ]);
              setSheetOpen(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
