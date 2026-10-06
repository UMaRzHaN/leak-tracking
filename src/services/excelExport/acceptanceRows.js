import { receivedByItem, summarizeInvoice } from "@/domain/equipmentAcceptance";

/**
 * «Приёмка оборудования» (7e–7h): строка на позицию в каждой партии. Так
 * видно и что пришло в этот раз, и сколько по позиции набралось и осталось
 * по всей накладной. Партии берутся за период выгрузки — как и утечки.
 *
 * @param {any[]} invoices
 * @param {{ from: number|null, to: number|null }} [range]
 */
export function getAcceptanceExportRows(
  invoices,
  range = { from: null, to: null },
) {
  const inRange = (iso) => {
    const time = Date.parse(String(iso ?? ""));
    if (!Number.isFinite(time)) return range.from === null && range.to === null;
    return (
      (range.from === null || time >= range.from) &&
      (range.to === null || time <= range.to)
    );
  };
  const rows = [];
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const received = receivedByItem(invoice);
    const { status } = summarizeInvoice(invoice);
    const items = new Map((invoice.items ?? []).map((item) => [item.id, item]));
    (invoice.batches ?? []).forEach((batch, batchIndex) => {
      if (!inRange(batch.date)) return;
      for (const line of batch.lines ?? []) {
        const item = items.get(line.itemId);
        if (!item) continue;
        const ordered = Number(item.ordered) || 0;
        const got = received.get(item.id) ?? 0;
        rows.push({
          invoice: invoice.number ?? "",
          supplier: invoice.supplier ?? "",
          warehouse: invoice.warehouse ?? "",
          status,
          batch: batchIndex + 1,
          dateRaw: batch.date,
          name: item.name ?? "",
          unit: item.unit ?? "",
          ordered,
          qty: Number(line.qty) || 0,
          received: got,
          left: Math.max(0, ordered - got),
          complete: line.complete !== false,
          dnpnMatch: line.dnpnMatch !== false,
          remark: line.remark ?? "",
          user: batch.user ?? "",
        });
      }
    });
  }
  return rows;
}
