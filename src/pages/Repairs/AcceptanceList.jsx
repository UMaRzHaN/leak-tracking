import { lazy, Suspense, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import Icon from "@/components/ui/Icon/Icon";
import Notification from "@/components/ui/Notification/Notification";
import {
  ACCEPTANCE_STATUS,
  summarizeInvoice,
} from "@/domain/equipmentAcceptance";
import { useAcceptances } from "@/utils/acceptanceStorage";
import { formatMonitoringDate } from "@/utils/monitoring";
import s from "./Repairs.module.scss";

const AcceptanceScreen = lazy(() => import("./AcceptanceScreen"));

const STATUS_TONE = {
  [ACCEPTANCE_STATUS.PENDING]: "accent",
  [ACCEPTANCE_STATUS.PARTIAL]: "warn",
  [ACCEPTANCE_STATUS.ACCEPTED]: "ok",
};

/**
 * Приёмка оборудования (7f): накладные модуля ремонтов. Чипы — по тому,
 * сколько пришло; «Принять партию» открывает следующую партию той же
 * накладной, «Новая приёмка» — новую накладную.
 */
export default function AcceptanceList({ onBack, userProfile }) {
  const { t, lang } = useLanguage();
  const { activeProject } = useProjectData();
  const [invoices, saveInvoices] = useAcceptances(activeProject?.id ?? null);
  const [filter, setFilter] = useState(
    /** @type {string} */ (ACCEPTANCE_STATUS.PENDING),
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(/** @type {any} */ (undefined));
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const user = userProfile?.name?.trim() || undefined;

  const rows = useMemo(
    () =>
      invoices
        .map((invoice) => ({ invoice, summary: summarizeInvoice(invoice) }))
        .sort((left, right) =>
          String(right.invoice.updatedAt).localeCompare(
            String(left.invoice.updatedAt),
          ),
        ),
    [invoices],
  );
  const counts = useMemo(() => {
    const result = { pending: 0, partial: 0, accepted: 0 };
    for (const row of rows) result[row.summary.status] += 1;
    return result;
  }, [rows]);
  const visible = rows.filter(({ invoice, summary }) => {
    if (summary.status !== filter) return false;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [
      invoice.number,
      invoice.supplier,
      invoice.warehouse,
      ...invoice.items.map((item) => item.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });

  return (
    <div className={s.acceptancePage}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <header className={s.pageHeader}>
        <div className={s.pageHeaderRow}>
          <button
            type="button"
            className={s.screenClose}
            onClick={onBack}
            aria-label={t("leakDetails.back")}
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
          <div className={s.screenTitle}>
            <p className={s.caption}>{t("acceptance.caption")}</p>
            <h1>{t("acceptance.title")}</h1>
          </div>
        </div>
        <div className={s.search}>
          <Icon name="search" size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("acceptance.search")}
            aria-label={t("acceptance.search")}
          />
        </div>
      </header>

      <div className={s.acceptanceBody}>
        <div
          className={s.chipRow}
          role="group"
          aria-label={t("acceptance.filter")}
        >
          {[
            ACCEPTANCE_STATUS.PENDING,
            ACCEPTANCE_STATUS.PARTIAL,
            ACCEPTANCE_STATUS.ACCEPTED,
          ].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              className={filter === status ? s.chipOn : s.chipOff}
              onClick={() => setFilter(status)}
            >
              {t(`acceptance.status.${status}`)}
              <span>{counts[status]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className={s.empty}>{t("acceptance.empty")}</p>
        ) : (
          visible.map(({ invoice, summary }) => {
            const [firstItem] = invoice.items;
            const more = invoice.items.length - 1;
            const tone = summary.hasRemark
              ? "warn"
              : STATUS_TONE[summary.status];
            return (
              <article
                key={invoice.id}
                className={`${s.invoice} ${s[`invoice_${tone}`]}`}
              >
                <div className={s.invoiceHead}>
                  <span className={s.invoiceBadge}>
                    {summary.hasRemark &&
                    summary.status !== ACCEPTANCE_STATUS.ACCEPTED
                      ? t("acceptance.withRemark")
                      : t(`acceptance.badge.${summary.status}`)}
                  </span>
                  <strong>{invoice.number}</strong>
                  <small>
                    {formatMonitoringDate(summary.lastBatchAt, lang)}
                  </small>
                </div>
                <div className={s.invoiceBody}>
                  <strong>
                    {firstItem?.name}
                    {more > 0 && ` ${t("acceptance.andMore", { count: more })}`}
                  </strong>
                  <span>
                    {t("acceptance.progress", {
                      batches: summary.batches,
                      received: summary.received,
                      ordered: summary.ordered,
                    })}
                    {invoice.warehouse && ` · ${invoice.warehouse}`}
                  </span>
                </div>
                <div className={s.invoiceFoot}>
                  <span className={summary.left ? s.warnText : s.okText}>
                    {summary.left
                      ? t("acceptance.left", { count: summary.left })
                      : t("acceptance.allReceived")}
                  </span>
                  {summary.left > 0 && (
                    <button
                      type="button"
                      className={s.acceptBtn}
                      onClick={() => setEditing(invoice)}
                    >
                      {t("acceptance.acceptBatch")}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <footer className={s.screenFooter}>
        <button
          type="button"
          className={s.primary}
          onClick={() => setEditing(null)}
        >
          <Icon name="plus" size={20} strokeWidth={2.2} />{" "}
          {t("acceptance.newAcceptance")}
        </button>
      </footer>

      {editing !== undefined && (
        <Suspense fallback={null}>
          <AcceptanceScreen
            invoice={editing}
            user={user}
            onClose={() => setEditing(undefined)}
            onSave={(next) => {
              saveInvoices([
                ...invoices.filter((invoice) => invoice.id !== next.id),
                next,
              ]);
              setEditing(undefined);
              setFilter(summarizeInvoice(next).status);
              setNotification({
                type: "success",
                message: t("acceptance.saved"),
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
